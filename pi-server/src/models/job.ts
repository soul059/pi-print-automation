import { getDb } from '../db/connection';
import { nanoid } from 'nanoid';

export type JobStatus =
  | 'uploaded'
  | 'payment_pending'
  | 'paid'
  | 'printing'
  | 'completed'
  | 'failed'
  | 'failed_permanent';

export type PrintMode = 'now' | 'later';
export type ColorMode = 'grayscale' | 'color';

export interface Job {
  id: string;
  user_email: string;
  user_name: string;
  file_name: string;
  file_path: string;
  total_pages: number;
  print_pages: string | null;
  paper_size: string;
  copies: number;
  duplex: number;
  color: ColorMode;
  print_mode: PrintMode;
  status: JobStatus;
  cups_job_id: string | null;
  printer_name: string | null;
  price: number;
  retry_count: number;
  error_message: string | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
}

// Valid state transitions
const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  uploaded: ['payment_pending'],
  payment_pending: ['paid', 'failed'],
  paid: ['printing'],
  printing: ['completed', 'failed'],
  completed: [],
  failed: ['paid', 'printing', 'failed_permanent'],
  failed_permanent: [],
};

export function createJob(data: {
  userEmail: string;
  userName: string;
  fileName: string;
  filePath: string;
  totalPages: number;
  printPages?: string;
  paperSize?: string;
  copies?: number;
  duplex?: boolean;
  color?: ColorMode;
  printMode?: PrintMode;
  price: number;
  printerName?: string;
  scheduledAt?: string;
}): Job {
  const db = getDb();
  const id = `job_${nanoid(12)}`;

  db.prepare(
    `INSERT INTO jobs (id, user_email, user_name, file_name, file_path, total_pages, print_pages, paper_size, copies, duplex, color, print_mode, price, printer_name, scheduled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.userEmail,
    data.userName,
    data.fileName,
    data.filePath,
    data.totalPages,
    data.printPages || null,
    data.paperSize || 'A4',
    data.copies || 1,
    data.duplex ? 1 : 0,
    data.color || 'grayscale',
    data.printMode || 'now',
    data.price,
    data.printerName || null,
    data.scheduledAt || null
  );

  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Job;
}

export function getJob(id: string): Job | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Job) || null;
}

export function getJobsByEmail(email: string): Job[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM jobs WHERE user_email = ? ORDER BY created_at DESC')
    .all(email) as Job[];
}

export function transitionJob(id: string, newStatus: JobStatus, errorMessage?: string): boolean {
  const db = getDb();
  const job = getJob(id);
  if (!job) return false;

  const allowed = VALID_TRANSITIONS[job.status];
  if (!allowed.includes(newStatus)) {
    return false;
  }

  if (errorMessage) {
    db.prepare(
      "UPDATE jobs SET status = ?, error_message = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(newStatus, errorMessage, id);
  } else {
    db.prepare("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
      newStatus,
      id
    );
  }

  return true;
}

export function getAllJobs(filters?: {
  status?: JobStatus;
  limit?: number;
  offset?: number;
}): { jobs: Job[]; total: number } {
  const db = getDb();
  let where = '';
  const params: any[] = [];

  if (filters?.status) {
    where = 'WHERE status = ?';
    params.push(filters.status);
  }

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM jobs ${where}`).get(...params) as any
  ).count;

  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  const jobs = db
    .prepare(`SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Job[];

  return { jobs, total };
}
