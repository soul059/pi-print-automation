import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { nanoid } from 'nanoid';
import { env } from '../config/env';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validatePdf, getPageCount } from '../services/pdf';
import { calculatePrice } from '../services/pricing';
import { createJob } from '../models/job';
import { logger } from '../config/logger';
import { getEstimatedWaitMinutes } from '../services/queue';

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

uploadRouter.post('/', requireAuth, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Parse config
    let config: any = {};
    if (req.body.config) {
      try {
        config = JSON.parse(req.body.config);
      } catch {
        res.status(400).json({ error: 'Invalid config JSON' });
        return;
      }
    }

    // Validate PDF
    const validation = await validatePdf(req.file.path);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const totalPages = validation.pages!;
    const color = config.color === 'color' ? 'color' : 'grayscale';
    const copies = Math.min(Math.max(parseInt(config.copies) || 1, 1), 50);
    const duplex = config.duplex === true;

    // Calculate price
    const pricing = calculatePrice(totalPages, config.pageRange, color, copies, duplex);

    // Create job
    const job = createJob({
      userEmail: req.userEmail!,
      userName: req.userName!,
      fileName: req.file.originalname,
      filePath: req.file.path,
      totalPages,
      printPages: config.pageRange,
      paperSize: config.paperSize || 'A4',
      copies,
      duplex,
      color,
      printMode: config.printMode === 'later' ? 'later' : 'now',
      price: pricing.total,
    });

    logger.info({ jobId: job.id, pages: totalPages, price: pricing.total }, 'Job created');

    res.status(201).json({
      jobId: job.id,
      fileName: req.file.originalname,
      totalPages,
      printPages: pricing.printPages,
      price: pricing.total,
      currency: 'INR',
      status: job.status,
      estimatedWait: `${getEstimatedWaitMinutes()} minutes`,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Upload failed');
    res.status(500).json({ error: 'Upload failed' });
  }
});
