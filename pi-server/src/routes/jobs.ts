import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getJob, getJobsByEmail } from '../models/job';
import { getDb } from '../db/connection';
import { getQueuePosition } from '../services/queue';

export const jobsRouter = Router();

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
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  });
});
