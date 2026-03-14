import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getJob, getJobsByEmail } from '../models/job';
import { getDb } from '../db/connection';
import { getQueuePosition } from '../services/queue';

export const jobsRouter = Router();

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
      createdAt: j.created_at,
      updatedAt: j.updated_at,
    })),
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
    cupsJobId: job.cups_job_id,
    errorMessage: job.error_message,
    refundStatus: payment?.refund_status || null,
    refundId: payment?.refund_id || null,
    queuePosition: (job.status === 'paid' || job.status === 'printing') ? getQueuePosition(job.id) : null,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  });
});
