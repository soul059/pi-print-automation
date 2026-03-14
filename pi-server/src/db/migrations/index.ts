import { getDb } from '../connection';
import type { DbWrapper } from '../connection';
import { logger } from '../../config/logger';

export function runMigrations(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM migrations').all().map((r: any) => r.name)
  );

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      logger.info({ migration: migration.name }, 'Running migration');
      // Run each statement separately for sql.js compatibility
      for (const stmt of migration.statements) {
        db.exec(stmt);
      }
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
    }
  }

  logger.info('All migrations applied');
}

const migrations = [
  {
    name: '001_initial_schema',
    statements: [
      `CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        user_email TEXT NOT NULL,
        user_name TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        total_pages INTEGER NOT NULL DEFAULT 0,
        print_pages TEXT,
        paper_size TEXT NOT NULL DEFAULT 'A4',
        copies INTEGER NOT NULL DEFAULT 1,
        duplex INTEGER NOT NULL DEFAULT 0,
        color TEXT NOT NULL DEFAULT 'grayscale',
        print_mode TEXT NOT NULL DEFAULT 'now',
        status TEXT NOT NULL DEFAULT 'uploaded',
        cups_job_id TEXT,
        price INTEGER NOT NULL DEFAULT 0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_email ON jobs(user_email)`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at)`,
      `CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id),
        razorpay_order_id TEXT UNIQUE,
        razorpay_payment_id TEXT,
        razorpay_signature TEXT,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL DEFAULT 'created',
        webhook_verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_payments_job ON payments(job_id)`,
      `CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(razorpay_order_id)`,
      `CREATE TABLE IF NOT EXISTS otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        otp TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email)`,
      `CREATE TABLE IF NOT EXISTS email_policies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        domain TEXT NOT NULL,
        pattern TEXT NOT NULL,
        department_key TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS printer_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        printer_name TEXT NOT NULL UNIQUE,
        display_name TEXT,
        supports_color INTEGER NOT NULL DEFAULT 0,
        supports_duplex INTEGER NOT NULL DEFAULT 0,
        paper_sizes TEXT NOT NULL DEFAULT '["A4"]',
        default_paper_size TEXT NOT NULL DEFAULT 'A4',
        capabilities_json TEXT,
        last_probed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  },
  {
    name: '002_admins_table',
    statements: [
      `CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        role TEXT NOT NULL DEFAULT 'admin',
        active INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  },
  {
    name: '003_seed_default_policy',
    statements: [
      `INSERT OR IGNORE INTO email_policies (name, domain, pattern, department_key, active)
       VALUES ('IT Undergraduate B', 'ddu.ac.in', '^[0-9]{2}itub[0-9]{3}$', 'itub', 1)`,
      `INSERT OR IGNORE INTO email_policies (name, domain, pattern, department_key, active)
       VALUES ('CS Undergraduate B', 'ddu.ac.in', '^[0-9]{2}csub[0-9]{3}$', 'csub', 1)`,
      `INSERT OR IGNORE INTO email_policies (name, domain, pattern, department_key, active)
       VALUES ('EC Undergraduate B', 'ddu.ac.in', '^[0-9]{2}ecub[0-9]{3}$', 'ecub', 1)`,
    ],
  },
  {
    name: '004_payment_refund_columns',
    statements: [
      `ALTER TABLE payments ADD COLUMN refund_status TEXT DEFAULT NULL`,
      `ALTER TABLE payments ADD COLUMN refund_id TEXT DEFAULT NULL`,
    ],
  },
];
