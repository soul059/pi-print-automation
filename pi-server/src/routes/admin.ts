import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import { nanoid } from 'nanoid';
import { requireAdmin, generateAdminToken } from '../middleware/auth';
import { getAllPolicies, createPolicy, updatePolicy, deletePolicy } from '../services/policy';
import { getAllJobs, transitionJob, getJob, createJob } from '../models/job';
import { getPrinterStatus, getAllPrinterStatuses, enablePrinter, disablePrinter, listPrinters, cancelJob } from '../services/cups';
import { getOrProbePrinter } from '../models/printer';
import { enqueueJob, getQueueDepth } from '../services/queue';
import { processRefund } from '../services/refund';
import { getDb } from '../db/connection';
import { logger } from '../config/logger';
import { getDailyPageLimit, setDailyPageLimit } from '../services/limits';
import { validatePdf, getPageCount } from '../services/pdf';
import { getOperatingHours, setOperatingHours, OperatingHours } from '../services/settings';
import os from 'os';
import fs from 'fs';
import { env } from '../config/env';
import { telegram } from '../services/telegram';

// Multer for admin uploads
const adminStorage = multer.diskStorage({
  destination: env.UPLOAD_DIR,
  filename: (_req, file, cb) => {
    cb(null, `admin_${nanoid(12)}${path.extname(file.originalname)}`);
  },
});
const adminUpload = multer({
  storage: adminStorage,
  limits: { fileSize: env.MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files are allowed'));
      return;
    }
    cb(null, true);
  },
});

export const adminRouter = Router();

// Rate limiter for admin login — prevents brute-force attacks
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

function escapeCsvField(value: string): string {
  if (value == null) return '';
  const str = String(value);
  const sanitized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

// --- Admin Login (public, no auth required) ---

adminRouter.post('/login', adminLoginLimiter, async (req: Request, res: Response) => {
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

adminRouter.get('/jobs/export', (_req: Request, res: Response) => {
  const db = getDb();
  const jobs = db.prepare(
    'SELECT id, user_email, file_name, total_pages, status, price, paper_size, copies, duplex, color, print_mode, printer_name, created_at, updated_at FROM jobs ORDER BY created_at DESC'
  ).all() as any[];

  const header = 'Job ID,User Email,File Name,Pages,Status,Price (₹),Paper Size,Copies,Duplex,Color,Mode,Printer,Created,Updated\n';
  const rows = jobs.map((j: any) => [
    escapeCsvField(j.id),
    escapeCsvField(j.user_email || ''),
    escapeCsvField(j.file_name || ''),
    j.total_pages,
    escapeCsvField(j.status),
    ((j.price || 0) / 100).toFixed(2),
    escapeCsvField(j.paper_size || ''),
    j.copies,
    j.duplex ? 'Yes' : 'No',
    escapeCsvField(j.color || ''),
    escapeCsvField(j.print_mode || ''),
    escapeCsvField(j.printer_name || ''),
    escapeCsvField(j.created_at || ''),
    escapeCsvField(j.updated_at || ''),
  ].join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="all-print-history-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(header + rows);
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

  // Block retry if job was already refunded — prevents free printing
  const db = getDb();
  const payment = db.prepare(
    "SELECT refund_status FROM payments WHERE job_id = ? AND status = 'captured' ORDER BY created_at DESC LIMIT 1"
  ).get(job.id) as any;

  if (payment?.refund_status === 'refunded') {
    res.status(400).json({ error: 'Cannot retry: this job was already refunded. Create a new print job instead.' });
    return;
  }

  // Use state machine for transition
  const failedToPaid = job.status === 'failed'
    ? transitionJob(job.id, 'paid')
    : (() => { transitionJob(job.id, 'failed', 'Admin retry'); return transitionJob(job.id, 'paid'); })();

  if (!failedToPaid) {
    res.status(400).json({ error: 'Failed to transition job for retry' });
    return;
  }

  db.prepare(
    "UPDATE jobs SET retry_count = 0, error_message = NULL, updated_at = datetime('now') WHERE id = ?"
  ).run(job.id);
  enqueueJob(job.id);

  logger.info({ jobId: job.id }, 'Admin: job retry initiated');
  res.json({ success: true, jobId: job.id, status: 'paid' });
});

adminRouter.post('/jobs/:jobId/cancel', async (req: Request<{jobId: string}>, res: Response) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  if (job.status === 'completed' || job.status === 'failed_permanent') {
    res.status(400).json({ error: 'Cannot cancel completed or permanently failed jobs' });
    return;
  }

  // If job is currently printing, try to cancel CUPS job first
  if (job.status === 'printing' && job.cups_job_id) {
    try {
      await cancelJob(job.cups_job_id);
    } catch (err: any) {
      logger.warn({ jobId: job.id, err: err.message }, 'CUPS cancel attempt failed');
    }
  }

  // Use state machine: transition through valid paths
  // printing → failed → failed_permanent
  // paid → printing → failed → failed_permanent (need to go through valid path)
  // uploaded/payment_pending → failed → failed_permanent
  const db = getDb();
  if (job.status === 'printing') {
    transitionJob(job.id, 'failed', 'Cancelled by admin');
    transitionJob(job.id, 'failed_permanent');
  } else if (job.status === 'paid') {
    // paid → printing → failed → failed_permanent
    const toPrinting = transitionJob(job.id, 'printing');
    if (toPrinting) {
      transitionJob(job.id, 'failed', 'Cancelled by admin');
      transitionJob(job.id, 'failed_permanent');
    }
  } else if (job.status === 'payment_pending') {
    transitionJob(job.id, 'failed', 'Cancelled by admin');
    transitionJob(job.id, 'failed_permanent');
  } else if (job.status === 'failed') {
    transitionJob(job.id, 'failed_permanent');
  } else {
    // uploaded — no payment yet, cancel via state machine
    transitionJob(job.id, 'failed_permanent');
    const db2 = getDb();
    db2.prepare("UPDATE jobs SET error_message = 'Cancelled by admin' WHERE id = ?").run(job.id);
  }

  // Auto-refund cancelled jobs that had a captured payment
  const updatedJob = getJob(job.id);
  if (updatedJob?.status === 'failed_permanent') {
    const payment = db.prepare(
      "SELECT * FROM payments WHERE job_id = ? AND status = 'captured' AND (refund_status IS NULL OR refund_status = 'failed') ORDER BY created_at DESC LIMIT 1"
    ).get(job.id) as any;
    if (payment) {
      processRefund(job.id).catch(err => {
        logger.error({ jobId: job.id, err: err.message }, 'Auto-refund after admin cancel failed');
      });
    }
  }

  // Verify final state
  const updated = getJob(job.id);
  res.json({ success: true, jobId: job.id, status: updated?.status || 'failed_permanent' });
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

// Bulk refund
adminRouter.post('/jobs/bulk-refund', async (req: Request, res: Response) => {
  const { jobIds } = req.body;
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    res.status(400).json({ error: 'jobIds array required' });
    return;
  }
  if (jobIds.length > 50) {
    res.status(400).json({ error: 'Maximum 50 jobs per bulk refund' });
    return;
  }

  const results: Array<{ jobId: string; success: boolean; error?: string }> = [];

  for (const jobId of jobIds) {
    const job = getJob(jobId);
    if (!job) {
      results.push({ jobId, success: false, error: 'Job not found' });
      continue;
    }
    if (job.status !== 'failed_permanent') {
      results.push({ jobId, success: false, error: 'Not permanently failed' });
      continue;
    }
    try {
      const result = await processRefund(job.id);
      results.push({ jobId, success: result.success, error: result.error });
      if (result.success) {
        logger.info({ jobId }, 'Admin: bulk refund processed');
      }
    } catch (err: any) {
      results.push({ jobId, success: false, error: err.message });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  res.json({ results, summary: { total: results.length, succeeded, failed } });
});

// --- Announcements ---

adminRouter.get('/announcements', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const announcements = db.prepare('SELECT * FROM announcements ORDER BY id DESC').all();
    res.json({ announcements });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to fetch announcements');
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

adminRouter.post('/announcements', (req: Request, res: Response) => {
  try {
    const { message, type } = req.body;
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }
    const announcementType = type || 'info';
    if (!['info', 'warning', 'critical'].includes(announcementType)) {
      res.status(400).json({ error: 'Type must be info, warning, or critical' });
      return;
    }
    const db = getDb();
    const result = db
      .prepare('INSERT INTO announcements (message, type) VALUES (?, ?)')
      .run(message, announcementType);
    const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ announcement });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to create announcement');
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

adminRouter.put('/announcements/:id', (req: Request<{id: string}>, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid announcement ID' });
      return;
    }
    const db = getDb();
    const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Announcement not found' });
      return;
    }
    const { message, type, active } = req.body;
    if (type && !['info', 'warning', 'critical'].includes(type)) {
      res.status(400).json({ error: 'Type must be info, warning, or critical' });
      return;
    }
    const updates: string[] = [];
    const values: any[] = [];
    if (message !== undefined) { updates.push('message = ?'); values.push(message); }
    if (type !== undefined) { updates.push('type = ?'); values.push(type); }
    if (active !== undefined) { updates.push('active = ?'); values.push(active ? 1 : 0); }
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(id);
      db.prepare(`UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
    const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    res.json({ announcement });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to update announcement');
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

adminRouter.delete('/announcements/:id', (req: Request<{id: string}>, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid announcement ID' });
      return;
    }
    const db = getDb();
    const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Announcement not found' });
      return;
    }
    db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to delete announcement');
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

// --- Printers ---

adminRouter.get('/printers', async (_req: Request, res: Response) => {
  try {
    const statuses = await getAllPrinterStatuses();
    const detailed = await Promise.all(
      statuses.map(async (s) => {
        const profile = await getOrProbePrinter(s.printerName);
        return {
          name: s.printerName,
          online: s.online,
          status: s.status,
          accepting: s.accepting,
          capabilities: profile
            ? {
                color: profile.supports_color === 1,
                duplex: profile.supports_duplex === 1,
                paperSizes: JSON.parse(profile.paper_sizes || '["A4"]'),
              }
            : null,
        };
      })
    );
    res.json({ printers: detailed });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to list printers');
    res.status(500).json({ error: 'Failed to list printers' });
  }
});

adminRouter.post('/printers/:name/enable', async (req: Request<{name: string}>, res: Response) => {
  try {
    const printerName = req.params.name;
    const printers = await listPrinters();
    if (!printers.includes(printerName)) {
      res.status(404).json({ error: 'Printer not found in CUPS' });
      return;
    }
    await enablePrinter(printerName);
    res.json({ success: true, printer: printerName, enabled: true });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to enable printer');
    res.status(500).json({ error: 'Failed to enable printer' });
  }
});

adminRouter.post('/printers/:name/disable', async (req: Request<{name: string}>, res: Response) => {
  try {
    const printerName = req.params.name;
    const printers = await listPrinters();
    if (!printers.includes(printerName)) {
      res.status(404).json({ error: 'Printer not found in CUPS' });
      return;
    }
    await disablePrinter(printerName);
    res.json({ success: true, printer: printerName, enabled: false });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to disable printer');
    res.status(500).json({ error: 'Failed to disable printer' });
  }
});

// --- Analytics ---

adminRouter.get('/analytics', (req: Request, res: Response) => {
  try {
    const db = getDb();

    // Summary stats
    const totalJobs = (db.prepare('SELECT COUNT(*) as count FROM jobs').get() as any)?.count ?? 0;
    const completedJobs = (db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'completed'").get() as any)?.count ?? 0;
    const failedJobs = (db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status IN ('failed', 'failed_permanent')").get() as any)?.count ?? 0;
    const revenueRow = db.prepare("SELECT COALESCE(SUM(price), 0) as total FROM jobs WHERE status = 'completed'").get() as any;
    const totalRevenue = revenueRow?.total ?? 0;
    const pagesRow = db.prepare("SELECT COALESCE(SUM(total_pages), 0) as total FROM jobs WHERE status = 'completed'").get() as any;
    const totalPages = pagesRow?.total ?? 0;
    const avgJobPrice = completedJobs > 0 ? Math.round(totalRevenue / completedJobs) : 0;

    // Daily stats (last 30 days)
    const daily = db.prepare(
      `SELECT DATE(created_at) as date,
              COUNT(*) as jobs,
              COALESCE(SUM(CASE WHEN status = 'completed' THEN price ELSE 0 END), 0) as revenue,
              COALESCE(SUM(total_pages), 0) as pages
       FROM jobs
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY DATE(created_at)
       ORDER BY date`
    ).all() as any[];

    // Hourly distribution (all time)
    const hourly = db.prepare(
      `SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as jobs
       FROM jobs
       GROUP BY hour
       ORDER BY hour`
    ).all() as any[];

    // Fill missing hours with 0
    const hourlyMap = new Map(hourly.map((h: any) => [h.hour, h.jobs]));
    const hourlyFull = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      jobs: hourlyMap.get(i) ?? 0,
    }));

    // Status breakdown
    const statusBreakdown = db.prepare(
      'SELECT status, COUNT(*) as count FROM jobs GROUP BY status ORDER BY count DESC'
    ).all() as any[];

    // Payment type breakdown
    const paymentTypeBreakdown = db.prepare(
      `SELECT payment_type as type, COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
       FROM payments
       WHERE status = 'captured'
       GROUP BY payment_type`
    ).all() as any[];

    res.json({
      summary: { totalJobs, completedJobs, failedJobs, totalRevenue, totalPages, avgJobPrice },
      daily,
      hourly: hourlyFull,
      statusBreakdown,
      paymentTypeBreakdown,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Analytics fetch failed');
    res.status(500).json({ error: 'Failed to fetch analytics' });
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

// --- Print Limits ---

adminRouter.get('/settings/daily-limit', (_req: Request, res: Response) => {
  try {
    const limit = getDailyPageLimit();
    res.json({ limit });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get daily limit');
    res.status(500).json({ error: 'Failed to get daily limit' });
  }
});

adminRouter.put('/settings/daily-limit', (req: Request, res: Response) => {
  try {
    const { limit } = req.body;
    if (typeof limit !== 'number' || limit < 1) {
      res.status(400).json({ error: 'Limit must be a positive number' });
      return;
    }
    setDailyPageLimit(limit);
    logger.info({ limit }, 'Daily page limit updated');
    res.json({ limit });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to update daily limit');
    res.status(500).json({ error: 'Failed to update daily limit' });
  }
});

// --- Operating Hours ---

adminRouter.get('/settings/operating-hours', (_req: Request, res: Response) => {
  res.json(getOperatingHours());
});

adminRouter.put('/settings/operating-hours', (req: Request, res: Response) => {
  try {
    const { enabled, startHour, endHour, days } = req.body;
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be boolean' });
      return;
    }
    if (typeof startHour !== 'number' || startHour < 0 || startHour > 23) {
      res.status(400).json({ error: 'startHour must be 0-23' });
      return;
    }
    if (typeof endHour !== 'number' || endHour < 0 || endHour > 23) {
      res.status(400).json({ error: 'endHour must be 0-23' });
      return;
    }
    if (!Array.isArray(days) || !days.every((d: any) => typeof d === 'number' && d >= 0 && d <= 6)) {
      res.status(400).json({ error: 'days must be array of 0-6' });
      return;
    }
    const config: OperatingHours = { enabled, startHour, endHour, days };
    setOperatingHours(config);
    logger.info({ config }, 'Operating hours updated');
    res.json(config);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to update operating hours');
    res.status(500).json({ error: 'Failed to update operating hours' });
  }
});

adminRouter.get('/exemptions', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const exemptions = db.prepare(
      "SELECT * FROM print_exemptions WHERE expires_at > datetime('now') ORDER BY granted_at DESC"
    ).all();
    res.json({ exemptions });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get exemptions');
    res.status(500).json({ error: 'Failed to get exemptions' });
  }
});

adminRouter.post('/exemptions', (req: Request, res: Response) => {
  try {
    const { email, extraPages, reason } = req.body;
    if (!email || !extraPages) {
      res.status(400).json({ error: 'email and extraPages are required' });
      return;
    }
    if (typeof extraPages !== 'number' || extraPages < 1) {
      res.status(400).json({ error: 'extraPages must be a positive number' });
      return;
    }
    const db = getDb();
    const adminReq = req as any;
    const grantedBy = adminReq.adminUsername || 'admin';
    // Expires at end of current day
    const expiresAt = new Date();
    expiresAt.setHours(23, 59, 59, 999);
    const result = db.prepare(
      'INSERT INTO print_exemptions (user_email, extra_pages, reason, granted_by, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(email, extraPages, reason || null, grantedBy, expiresAt.toISOString());
    const exemption = db.prepare('SELECT * FROM print_exemptions WHERE id = ?').get(result.lastInsertRowid);
    logger.info({ email, extraPages, grantedBy }, 'Print exemption granted');
    res.status(201).json({ exemption });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to grant exemption');
    res.status(500).json({ error: 'Failed to grant exemption' });
  }
});

adminRouter.delete('/exemptions/:id', (req: Request<{id: string}>, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid exemption ID' });
      return;
    }
    const db = getDb();
    const existing = db.prepare('SELECT * FROM print_exemptions WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Exemption not found' });
      return;
    }
    db.prepare('DELETE FROM print_exemptions WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to revoke exemption');
    res.status(500).json({ error: 'Failed to revoke exemption' });
  }
});

// --- Admin Direct Print (skip payment) ---

adminRouter.post('/print', adminUpload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'PDF file required' });
      return;
    }

    const { paperSize, copies, duplex, color, printerName } = req.body;

    const isValid = await validatePdf(file.path);
    if (!isValid) {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: 'Invalid PDF file' });
      return;
    }

    const pageCount = await getPageCount(file.path);
    const adminReq = req as any;
    const adminUser = adminReq.adminUsername || 'admin';

    const job = createJob({
      userEmail: `${adminUser}@admin.local`,
      userName: `Admin: ${adminUser}`,
      fileName: file.originalname,
      filePath: file.path,
      totalPages: pageCount,
      paperSize: paperSize || 'A4',
      copies: parseInt(copies, 10) || 1,
      duplex: duplex === 'true' || duplex === true,
      color: color === 'color' ? 'color' : 'grayscale',
      printMode: 'now',
      price: 0,
      printerName: printerName || undefined,
    });

    // Skip payment — go directly to paid state
    transitionJob(job.id, 'payment_pending');
    transitionJob(job.id, 'paid');
    enqueueJob(job.id);

    logger.info({ jobId: job.id, admin: adminUser, file: file.originalname }, 'Admin direct print queued');

    res.json({
      jobId: job.id,
      status: 'paid',
      message: 'Job queued for printing (admin bypass)',
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Admin direct print failed');
    res.status(500).json({ error: 'Failed to queue print job' });
  }
});

// ── Maintenance Log ──

// List maintenance log entries
adminRouter.get('/maintenance', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const rows = db.prepare(
      'SELECT * FROM maintenance_log ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
    const countRow = db.prepare('SELECT COUNT(*) as total FROM maintenance_log').get() as any;
    res.json({ entries: rows, total: countRow?.total ?? 0 });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Maintenance list failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add maintenance log entry
adminRouter.post('/maintenance', (req: Request, res: Response) => {
  try {
    const { printerName, eventType, description } = req.body;
    if (!eventType || !description) {
      return res.status(400).json({ error: 'eventType and description are required' });
    }
    const validTypes = ['paper_refill', 'ink_refill', 'toner_replace', 'service', 'repair', 'cleaning', 'other'];
    if (!validTypes.includes(eventType)) {
      return res.status(400).json({ error: `eventType must be one of: ${validTypes.join(', ')}` });
    }
    if (description.length > 500) {
      return res.status(400).json({ error: 'Description too long (max 500 chars)' });
    }
    const db = getDb();
    const adminEmail = (req as any).adminUser || 'admin';
    db.prepare(
      'INSERT INTO maintenance_log (printer_name, event_type, description, admin_email) VALUES (?, ?, ?, ?)'
    ).run(printerName || null, eventType, description.slice(0, 500), adminEmail);
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Maintenance create failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete maintenance log entry
adminRouter.delete('/maintenance/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const db = getDb();
    db.prepare('DELETE FROM maintenance_log WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Maintenance delete failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Telegram ──

// Test Telegram notification
adminRouter.post('/telegram/test', async (_req: Request, res: Response) => {
  try {
    if (!telegram.isConfigured()) {
      return res.json({ success: false, message: 'Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env' });
    }
    const sent = await telegram.customAlert('Test Alert', 'This is a test notification from the print server admin panel.');
    res.json({ success: sent, message: sent ? 'Test message sent!' : 'Failed to send' });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Telegram test failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Telegram status
adminRouter.get('/telegram/status', (_req: Request, res: Response) => {
  res.json({
    configured: telegram.isConfigured(),
    botToken: env.TELEGRAM_BOT_TOKEN ? '****' + env.TELEGRAM_BOT_TOKEN.slice(-4) : '',
    chatId: env.TELEGRAM_CHAT_ID || '',
  });
});
