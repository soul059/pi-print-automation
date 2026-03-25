import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { requireAuth, AuthRequest, verifyToken } from '../middleware/auth';
import { validatePdf, getPageCount, mergePdfs } from '../services/pdf';
import { calculatePrice } from '../services/pricing';
import { createJob, getJob } from '../models/job';
import { logger } from '../config/logger';
import { getEstimatedWaitMinutes } from '../services/queue';
import { checkLimit } from '../services/limits';
import { isWithinOperatingHours } from '../services/settings';

// Multer config
const storage = multer.diskStorage({
  destination: env.UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const uniqueName = `${nanoid(12)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files are allowed'));
      return;
    }
    cb(null, true);
  },
});

export const uploadRouter = Router();

// Serve uploaded PDF for preview (accepts token via header or query param)
uploadRouter.get('/preview/:jobId', (req: AuthRequest, res: Response) => {
  try {
    // Accept auth from header or query param
    let userEmail: string | undefined;
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;

    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const user = verifyToken(token);
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    userEmail = user.email;

    const job = getJob(req.params.jobId as string);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.user_email !== userEmail) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (!fs.existsSync(job.file_path)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.sendFile(path.resolve(job.file_path));
  } catch (err: any) {
    logger.error({ err: err.message }, 'Preview failed');
    res.status(500).json({ error: 'Preview failed' });
  }
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many uploads, please try again later' },
  keyGenerator: (req: any) => req.userEmail || req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
});

uploadRouter.post('/', requireAuth, uploadLimiter, upload.array('files', 10), async (req: AuthRequest, res: Response) => {
  // Check operating hours
  const hoursCheck = isWithinOperatingHours();
  if (!hoursCheck.allowed) {
    // Clean up any uploaded files
    const files = req.files as Express.Multer.File[] | undefined;
    if (files) for (const f of files) { try { fs.unlinkSync(f.path); } catch {} }
    res.status(403).json({ error: hoursCheck.message || 'Service is currently closed' });
    return;
  }

  const uploadedFiles = req.files as Express.Multer.File[] | undefined;

  // Backward compatibility: accept single file via 'file' field
  // If no files via 'files', try single upload via 'file'
  if (!uploadedFiles || uploadedFiles.length === 0) {
    // Fall through to single-file handling below
    res.status(400).json({ error: 'No files uploaded' });
    return;
  }

  // Helper to clean up temp files on error
  const cleanupFiles = (paths: string[]) => {
    for (const p of paths) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
    }
  };

  try {
    // Parse config
    let config: any = {};
    if (req.body.config) {
      try {
        config = JSON.parse(req.body.config);
      } catch {
        cleanupFiles(uploadedFiles.map(f => f.path));
        res.status(400).json({ error: 'Invalid config JSON' });
        return;
      }
    }

    // Validate scheduledAt if provided
    let scheduledAt: string | undefined;
    if (config.scheduledAt) {
      const scheduledDate = new Date(config.scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        cleanupFiles(uploadedFiles.map(f => f.path));
        res.status(400).json({ error: 'Invalid scheduledAt format. Use ISO 8601.' });
        return;
      }
      const now = new Date();
      if (scheduledDate.getTime() <= now.getTime()) {
        cleanupFiles(uploadedFiles.map(f => f.path));
        res.status(400).json({ error: 'scheduledAt must be in the future' });
        return;
      }
      const maxDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (scheduledDate.getTime() > maxDate.getTime()) {
        cleanupFiles(uploadedFiles.map(f => f.path));
        res.status(400).json({ error: 'scheduledAt must be within 7 days from now' });
        return;
      }
      scheduledAt = scheduledDate.toISOString();
    }

    // Validate page range format early (prevent injection downstream)
    if (config.pageRange && !/^[\d,\- ]+$/.test(config.pageRange)) {
      cleanupFiles(uploadedFiles.map(f => f.path));
      res.status(400).json({ error: 'Invalid page range format. Use digits, commas, and dashes only (e.g., "1-5,8,11-13")' });
      return;
    }

    // Validate each PDF
    for (const file of uploadedFiles) {
      const validation = await validatePdf(file.path);
      if (!validation.valid) {
        cleanupFiles(uploadedFiles.map(f => f.path));
        res.status(400).json({ error: `${file.originalname}: ${validation.error}` });
        return;
      }
    }

    let finalPath: string;
    let totalPages: number;
    let fileName: string;

    if (uploadedFiles.length === 1) {
      // Single file — same as before
      const file = uploadedFiles[0];
      const validation = await validatePdf(file.path);
      totalPages = validation.pages!;
      finalPath = file.path;
      fileName = file.originalname;
    } else {
      // Multiple files — merge into one PDF
      const result = await mergePdfs(uploadedFiles.map(f => f.path));
      totalPages = result.totalPages;
      finalPath = result.mergedPath;
      fileName = uploadedFiles.map(f => f.originalname).join(', ');

      // Clean up individual temp files after merge
      cleanupFiles(uploadedFiles.map(f => f.path));
    }

    const color = config.color === 'color' ? 'color' : 'grayscale';
    const copies = Math.min(Math.max(parseInt(config.copies) || 1, 1), 50);
    const duplex = config.duplex === true;
    const printReceipt = config.printReceipt === true; // user explicitly wants printed receipt (costs 1 extra page)

    // Check daily page limit (accounting for pages in this upload * copies)
    const effectivePages = totalPages * copies;
    const limitResult = checkLimit(req.userEmail!, effectivePages);
    if (!limitResult.allowed) {
      if (uploadedFiles.length > 1) cleanupFiles([finalPath]);
      else cleanupFiles(uploadedFiles.map(f => f.path));
      res.status(403).json({
        error: 'daily_limit_exceeded',
        used: limitResult.used,
        limit: limitResult.limit,
        remaining: limitResult.remaining,
      });
      return;
    }

    // Calculate price (printReceipt adds 1 extra page at B/W rate)
    const pricing = calculatePrice(totalPages, config.pageRange, color, copies, duplex, printReceipt);

    // Create job
    const job = createJob({
      userEmail: req.userEmail!,
      userName: req.userName!,
      fileName,
      filePath: finalPath,
      totalPages,
      printPages: config.pageRange,
      paperSize: config.paperSize || 'A4',
      copies,
      duplex,
      color,
      printMode: config.printMode === 'later' ? 'later' : 'now',
      printReceipt,
      price: pricing.total,
      printerName: config.printer || undefined,
      scheduledAt,
    });

    logger.info({ jobId: job.id, pages: totalPages, fileCount: uploadedFiles.length, price: pricing.total }, 'Job created');

    res.status(201).json({
      jobId: job.id,
      fileName,
      totalPages,
      printPages: pricing.printPages,
      price: pricing.total,
      currency: 'INR',
      status: job.status,
      estimatedWait: `${getEstimatedWaitMinutes()} minutes`,
    });
  } catch (err: any) {
    cleanupFiles(uploadedFiles.map(f => f.path));
    logger.error({ err: err.message }, 'Upload failed');
    res.status(500).json({ error: 'Upload failed' });
  }
});

