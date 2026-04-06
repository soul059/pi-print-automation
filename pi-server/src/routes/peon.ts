import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { getDb } from '../db/connection';
import { env } from '../config/env';
import { logger } from '../config/logger';
import * as cups from '../services/cups';
import { 
  getPaperStatus, 
  getAllPaperStatus, 
  addPaper, 
  getReloadHistory,
  setLowThreshold 
} from '../services/paperTracking';
import { getQueueDepth } from '../services/queue';

export const peonRouter = Router();

// Rate limiter for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per IP
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// JWT secret for peon tokens
const PEON_JWT_SECRET = env.JWT_SECRET + '_peon';

// Middleware to verify peon token
interface PeonPayload {
  peonId: number;
  username: string;
  displayName: string;
  type: 'peon';
}

function peonAuth(req: Request, res: Response, next: () => void): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, PEON_JWT_SECRET) as PeonPayload;
    if (payload.type !== 'peon') {
      res.status(401).json({ error: 'Invalid token type' });
      return;
    }
    
    // Check if peon is still active
    const db = getDb();
    const peon = db.prepare('SELECT active FROM peons WHERE id = ?').get(payload.peonId) as { active: number } | undefined;
    if (!peon || !peon.active) {
      res.status(401).json({ error: 'Account is deactivated' });
      return;
    }
    
    (req as any).peon = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// --- Login ---
const loginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(100),
});

peonRouter.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid username or password format' });
    return;
  }

  const { username, password } = parsed.data;
  const db = getDb();

  try {
    const peon = db.prepare(
      'SELECT id, username, password_hash, display_name, active FROM peons WHERE username = ?'
    ).get(username) as any;

    if (!peon) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!peon.active) {
      res.status(401).json({ error: 'Account is deactivated' });
      return;
    }

    const valid = await bcrypt.compare(password, peon.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Update last login
    db.prepare(
      "UPDATE peons SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).run(peon.id);

    // Generate token
    const payload: PeonPayload = {
      peonId: peon.id,
      username: peon.username,
      displayName: peon.display_name || peon.username,
      type: 'peon',
    };
    const token = jwt.sign(payload, PEON_JWT_SECRET, { expiresIn: '12h' });

    logger.info({ peonId: peon.id, username }, 'Peon logged in');

    res.json({
      token,
      user: {
        id: peon.id,
        username: peon.username,
        displayName: peon.display_name || peon.username,
      },
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Peon login error');
    res.status(500).json({ error: 'Login failed' });
  }
});

// --- Get Status (printers + paper counts) ---
peonRouter.get('/status', peonAuth, async (req: Request, res: Response) => {
  try {
    // Get all printers
    const printers = await cups.listPrinters();
    
    // Get status and paper info for each
    const printerStatuses = await Promise.all(
      printers.map(async (name) => {
        const status = await cups.getPrinterStatus(name);
        const paper = getPaperStatus(name);
        
        return {
          name,
          online: status.online,
          status: status.status,
          paperCount: paper.currentCount,
          lowThreshold: paper.lowThreshold,
          isLow: paper.isLow,
          lastLoadedAt: paper.lastLoadedAt,
          lastLoadedBy: paper.lastLoadedBy,
        };
      })
    );

    const queueDepth = getQueueDepth();

    res.json({
      printers: printerStatuses,
      queueDepth,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get peon status');
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// --- Add Paper ---
const addPaperSchema = z.object({
  printerName: z.string().min(1),
  count: z.number().int().positive().max(10000),
});

peonRouter.post('/paper/add', peonAuth, async (req: Request, res: Response) => {
  const parsed = addPaperSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    return;
  }

  const { printerName, count } = parsed.data;
  const peon = (req as any).peon as PeonPayload;

  try {
    const result = addPaper(printerName, count, peon.displayName);
    
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    logger.info({
      printerName,
      addedCount: count,
      previousCount: result.previousCount,
      newCount: result.newCount,
      peon: peon.username,
    }, 'Paper added by peon');

    res.json(result);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to add paper');
    res.status(500).json({ error: 'Failed to add paper' });
  }
});

// --- Get Activity (recent jobs + reloads) ---
peonRouter.get('/activity', peonAuth, async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    // Recent completed jobs
    const recentJobs = db.prepare(`
      SELECT id, file_name, total_pages, copies, user_name, printer_name, updated_at
      FROM jobs
      WHERE status = 'completed'
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit) as any[];

    // Recent paper reloads
    const recentReloads = getReloadHistory(undefined, limit);

    res.json({
      recentJobs: recentJobs.map(j => ({
        id: j.id,
        fileName: j.file_name,
        pages: j.total_pages * (j.copies || 1),
        userName: j.user_name,
        printerName: j.printer_name,
        completedAt: j.updated_at,
      })),
      recentReloads: recentReloads.map(r => ({
        printerName: r.printerName,
        addedCount: r.addedCount,
        newCount: r.newCount,
        loadedBy: r.loadedBy,
        createdAt: r.createdAt,
      })),
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get activity');
    res.status(500).json({ error: 'Failed to get activity' });
  }
});

// --- Verify token (for frontend session check) ---
peonRouter.get('/me', peonAuth, (req: Request, res: Response) => {
  const peon = (req as any).peon as PeonPayload;
  res.json({
    id: peon.peonId,
    username: peon.username,
    displayName: peon.displayName,
  });
});
