import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getJob, getJobsByEmail, createJob } from '../models/job';
import { getDb } from '../db/connection';
import { getQueuePosition } from '../services/queue';
import { calculatePrice } from '../services/pricing';
import fs from 'fs';

export const jobsRouter = Router();

// User print history stats
jobsRouter.get('/stats', requireAuth, (req: AuthRequest, res: Response) => {
  const db = getDb();
  const email = req.userEmail!;

  const totals = db.prepare(
    `SELECT COUNT(*) as totalJobs,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completedJobs,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN total_pages * copies ELSE 0 END), 0) as totalPages,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN price ELSE 0 END), 0) as totalSpent,
            COALESCE(SUM(CASE WHEN status IN ('failed','failed_permanent') THEN 1 ELSE 0 END), 0) as failedJobs
     FROM jobs WHERE user_email = ?`
  ).get(email) as any;

  // Monthly breakdown (last 6 months)
  const monthly = db.prepare(
    `SELECT strftime('%Y-%m', created_at) as month,
            COUNT(*) as jobs,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN price ELSE 0 END), 0) as spent,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN total_pages * copies ELSE 0 END), 0) as pages
     FROM jobs WHERE user_email = ? AND created_at >= datetime('now', '-6 months')
     GROUP BY month ORDER BY month`
  ).all(email) as any[];

  // Most used settings
  const topPaperSize = db.prepare(
    `SELECT paper_size, COUNT(*) as count FROM jobs WHERE user_email = ? GROUP BY paper_size ORDER BY count DESC LIMIT 1`
  ).get(email) as any;

  const colorVsBw = db.prepare(
    `SELECT color, COUNT(*) as count FROM jobs WHERE user_email = ? GROUP BY color ORDER BY count DESC`
  ).all(email) as any[];

  res.json({
    stats: {
      totalJobs: totals?.totalJobs ?? 0,
      completedJobs: totals?.completedJobs ?? 0,
      failedJobs: totals?.failedJobs ?? 0,
      totalPages: totals?.totalPages ?? 0,
      totalSpent: totals?.totalSpent ?? 0,
      avgJobPrice: totals?.completedJobs > 0 ? Math.round(totals.totalSpent / totals.completedJobs) : 0,
    },
    monthly,
    preferences: {
      topPaperSize: topPaperSize?.paper_size || 'A4',
      colorBreakdown: colorVsBw,
    },
  });
});

function escapeCsvField(value: string): string {
  if (value == null) return '';
  const str = String(value);
  // Prevent CSV injection
  const sanitized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

jobsRouter.get('/', requireAuth, (req: AuthRequest, res: Response) => {
  const jobs = getJobsByEmail(req.userEmail!);
  res.json({
    jobs: jobs.map((j) => ({
      jobId: j.id,
      status: j.status,
      fileName: j.file_name,
      printMode: j.print_mode,
      pages: j.total_pages,
      copies: j.copies,
      price: j.price,
      printerName: j.printer_name || null,
      scheduledAt: j.scheduled_at || null,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
    })),
  });
});

jobsRouter.get('/export', requireAuth, (req: AuthRequest, res: Response) => {
  const db = getDb();
  const jobs = db.prepare(
    'SELECT id, file_name, total_pages, status, price, paper_size, copies, duplex, color, print_mode, created_at, updated_at FROM jobs WHERE user_email = ? ORDER BY created_at DESC'
  ).all(req.userEmail!) as any[];

  const header = 'Job ID,File Name,Pages,Status,Price (₹),Paper Size,Copies,Duplex,Color,Mode,Created,Updated\n';
  const rows = jobs.map((j: any) => [
    escapeCsvField(j.id),
    escapeCsvField(j.file_name || ''),
    j.total_pages,
    escapeCsvField(j.status),
    ((j.price || 0) / 100).toFixed(2),
    escapeCsvField(j.paper_size || ''),
    j.copies,
    j.duplex ? 'Yes' : 'No',
    escapeCsvField(j.color || ''),
    escapeCsvField(j.print_mode || ''),
    escapeCsvField(j.created_at || ''),
    escapeCsvField(j.updated_at || ''),
  ].join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="print-history-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(header + rows);
});

// Re-print a completed job (creates a new job from the same file)
jobsRouter.post('/:jobId/reprint', requireAuth, (req: AuthRequest, res: Response) => {
  const originalJob = getJob(req.params.jobId as string);
  if (!originalJob) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (originalJob.user_email !== req.userEmail) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }
  if (!originalJob.file_path || !fs.existsSync(originalJob.file_path)) {
    res.status(400).json({ error: 'Original file no longer available. Files are cleaned up periodically.' });
    return;
  }

  // Allow overriding some options
  const {
    paperSize = originalJob.paper_size,
    copies = originalJob.copies,
    duplex = originalJob.duplex === 1,
    color = originalJob.color,
    printMode = originalJob.print_mode,
  } = req.body || {};

  const priceCalc = calculatePrice(
    originalJob.total_pages,
    originalJob.print_pages || undefined,
    color as 'grayscale' | 'color',
    Number(copies),
    Boolean(duplex)
  );

  const newJob = createJob({
    userEmail: req.userEmail!,
    userName: originalJob.user_name,
    fileName: originalJob.file_name,
    filePath: originalJob.file_path,
    totalPages: originalJob.total_pages,
    printPages: originalJob.print_pages || undefined,
    paperSize: String(paperSize),
    copies: Number(copies),
    duplex: Boolean(duplex),
    color: color as 'grayscale' | 'color',
    printMode: printMode as 'now' | 'later',
    price: priceCalc.total,
    printerName: originalJob.printer_name || undefined,
  });

  res.json({
    jobId: newJob.id,
    price: newJob.price,
    message: 'Re-print job created. Proceed to payment.',
  });
});

jobsRouter.get('/:jobId/receipt', requireAuth, (req: AuthRequest, res: Response) => {
  const job = getJob(req.params.jobId as string);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (job.user_email !== req.userEmail) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }
  if (job.status !== 'completed' && job.status !== 'failed_permanent') {
    res.status(400).json({ error: 'Receipt available only for completed or permanently failed jobs' });
    return;
  }

  const db = getDb();
  const payment = db.prepare(
    'SELECT razorpay_payment_id, payment_type, refund_status FROM payments WHERE job_id = ?'
  ).get(job.id) as any;

  res.json({
    receipt: {
      jobId: job.id,
      status: job.status,
      userName: job.user_name,
      userEmail: job.user_email,
      fileName: job.file_name,
      totalPages: job.total_pages,
      printPages: job.print_pages || 'All',
      paperSize: job.paper_size,
      copies: job.copies,
      duplex: job.duplex === 1,
      color: job.color,
      printMode: job.print_mode,
      printerName: job.printer_name || 'Auto',
      price: job.price,
      paymentId: payment?.razorpay_payment_id || null,
      paymentType: payment?.payment_type || null,
      refundStatus: payment?.refund_status || null,
      createdAt: job.created_at,
      completedAt: job.updated_at,
    },
  });
});

jobsRouter.get('/:jobId', requireAuth, (req: AuthRequest, res: Response) => {
  const job = getJob(req.params.jobId as string);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  if (job.user_email !== req.userEmail) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }

  // Fetch refund info from payments table
  const db = getDb();
  const payment = db.prepare(
    'SELECT refund_status, refund_id FROM payments WHERE job_id = ?'
  ).get(job.id) as any;

  res.json({
    jobId: job.id,
    status: job.status,
    fileName: job.file_name,
    printMode: job.print_mode,
    totalPages: job.total_pages,
    printPages: job.print_pages,
    paperSize: job.paper_size,
    copies: job.copies,
    duplex: job.duplex === 1,
    color: job.color,
    price: job.price,
    printerName: job.printer_name || null,
    cupsJobId: job.cups_job_id,
    errorMessage: job.error_message,
    refundStatus: payment?.refund_status || null,
    refundId: payment?.refund_id || null,
    queuePosition: (job.status === 'paid' || job.status === 'printing') ? getQueuePosition(job.id) : null,
    scheduledAt: job.scheduled_at || null,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  });
});
