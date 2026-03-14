import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { requireAdmin, generateAdminToken } from '../middleware/auth';
import { getAllPolicies, createPolicy, updatePolicy, deletePolicy } from '../services/policy';
import { getAllJobs, transitionJob, getJob } from '../models/job';
import { getPrinterStatus } from '../services/cups';
import { enqueueJob, getQueueDepth } from '../services/queue';
import { processRefund } from '../services/refund';
import { getDb } from '../db/connection';
import { logger } from '../config/logger';
import os from 'os';
import fs from 'fs';
import { env } from '../config/env';

export const adminRouter = Router();

// --- Admin Login (public, no auth required) ---

adminRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    const db = getDb();
    const admin = db.prepare('SELECT * FROM admins WHERE username = ? AND active = 1').get(username) as any;

    if (!admin) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Update last login
    db.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").run(admin.id);

    const token = generateAdminToken(admin.id, admin.username, admin.role);
    logger.info({ username }, 'Admin login successful');

    res.json({
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        displayName: admin.display_name,
        role: admin.role,
      },
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Admin login error');
    res.status(500).json({ error: 'Login failed' });
  }
});

// All routes below require admin auth
adminRouter.use(requireAdmin);

// --- Email Policies ---

adminRouter.get('/policies', (_req: Request, res: Response) => {
  const policies = getAllPolicies();
  res.json({ policies });
});

adminRouter.post('/policies', (req: Request, res: Response) => {
  const { name, domain, pattern, departmentKey, active } = req.body;
  if (!name || !domain || !pattern || !departmentKey) {
    res.status(400).json({ error: 'Missing required fields: name, domain, pattern, departmentKey' });
    return;
  }

  // Validate regex
  try {
    new RegExp(pattern);
  } catch {
    res.status(400).json({ error: 'Invalid regex pattern' });
    return;
  }

  const policy = createPolicy({ name, domain, pattern, departmentKey, active });
  res.status(201).json({ policy });
});

adminRouter.put('/policies/:id', (req: Request<{id: string}>, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid policy ID' });
    return;
  }

  if (req.body.pattern) {
    try {
      new RegExp(req.body.pattern);
    } catch {
      res.status(400).json({ error: 'Invalid regex pattern' });
      return;
    }
  }

  const policy = updatePolicy(id, req.body);
  if (!policy) {
    res.status(404).json({ error: 'Policy not found' });
    return;
  }

  res.json({ policy });
});

adminRouter.delete('/policies/:id', (req: Request<{id: string}>, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid policy ID' });
    return;
  }

  const deleted = deletePolicy(id);
  if (!deleted) {
    res.status(404).json({ error: 'Policy not found' });
    return;
  }

  res.json({ success: true });
});

// --- Jobs ---

adminRouter.get('/jobs', (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  const result = getAllJobs({
    status: status as any,
    limit,
    offset,
  });

  res.json(result);
});

adminRouter.post('/jobs/:jobId/retry', (req: Request<{jobId: string}>, res: Response) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  if (job.status !== 'failed' && job.status !== 'failed_permanent') {
    res.status(400).json({ error: 'Can only retry failed jobs' });
    return;
  }

  // Reset to paid and enqueue
  const db = getDb();
  db.prepare(
    "UPDATE jobs SET status = 'paid', retry_count = 0, error_message = NULL, updated_at = datetime('now') WHERE id = ?"
  ).run(job.id);
  enqueueJob(job.id);

  logger.info({ jobId: job.id }, 'Admin: job retry initiated');
  res.json({ success: true, jobId: job.id, status: 'paid' });
});

adminRouter.post('/jobs/:jobId/cancel', (req: Request<{jobId: string}>, res: Response) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  if (job.status === 'completed' || job.status === 'failed_permanent') {
    res.status(400).json({ error: 'Cannot cancel completed or permanently failed jobs' });
    return;
  }

  const db = getDb();
  db.prepare(
    "UPDATE jobs SET status = 'failed_permanent', error_message = 'Cancelled by admin', updated_at = datetime('now') WHERE id = ?"
  ).run(job.id);

  res.json({ success: true, jobId: job.id, status: 'failed_permanent' });
});

// --- Refund ---

adminRouter.post('/jobs/:jobId/refund', async (req: Request<{jobId: string}>, res: Response) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  if (job.status !== 'failed_permanent') {
    res.status(400).json({ error: 'Can only refund permanently failed jobs' });
    return;
  }

  const result = await processRefund(job.id);
  if (result.success) {
    logger.info({ jobId: job.id, refundId: result.refundId }, 'Admin: refund processed');
    res.json({ success: true, refundId: result.refundId });
  } else {
    res.status(400).json({ success: false, error: result.error });
  }
});

// --- System Health ---

adminRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const printerStatus = await getPrinterStatus();
    const db = getDb();

    // Job counts by status
    const jobCounts = db
      .prepare(
        `SELECT status, COUNT(*) as count FROM jobs GROUP BY status`
      )
      .all() as Array<{ status: string; count: number }>;

    const counts: Record<string, number> = {};
    for (const row of jobCounts) {
      counts[row.status] = row.count;
    }

    // Last successful print
    const lastPrint = db
      .prepare("SELECT updated_at FROM jobs WHERE status = 'completed' ORDER BY updated_at DESC LIMIT 1")
      .get() as any;

    // Disk usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);

    // Upload dir size
    let uploadSize = 0;
    try {
      const files = fs.readdirSync(env.UPLOAD_DIR);
      for (const f of files) {
        const stat = fs.statSync(`${env.UPLOAD_DIR}/${f}`);
        uploadSize += stat.size;
      }
    } catch {}

    res.json({
      printer: printerStatus,
      queue: {
        depth: getQueueDepth(),
        ...counts,
      },
      system: {
        memoryUsage: `${memUsage}%`,
        totalMemory: `${Math.round(totalMem / 1024 / 1024)} MB`,
        freeMemory: `${Math.round(freeMem / 1024 / 1024)} MB`,
        uptime: `${Math.round(os.uptime() / 3600)} hours`,
        uploadDirSize: `${Math.round(uploadSize / 1024 / 1024)} MB`,
        platform: os.platform(),
        arch: os.arch(),
      },
      lastSuccessfulPrint: lastPrint?.updated_at || null,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Health check failed');
    res.status(500).json({ error: 'Health check failed' });
  }
});
