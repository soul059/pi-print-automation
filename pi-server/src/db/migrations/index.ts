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
       VALUES ('IT Department', 'ddu.ac.in', '^[0-9]{2}it[a-z]+[0-9]{3}$', 'it', 1)`,
      `INSERT OR IGNORE INTO email_policies (name, domain, pattern, department_key, active)
       VALUES ('CS Department', 'ddu.ac.in', '^[0-9]{2}cs[a-z]+[0-9]{3}$', 'cs', 1)`,
      `INSERT OR IGNORE INTO email_policies (name, domain, pattern, department_key, active)
       VALUES ('EC Department', 'ddu.ac.in', '^[0-9]{2}ec[a-z]+[0-9]{3}$', 'ec', 1)`,
    ],
  },
  {
    name: '004_payment_refund_columns',
    statements: [
      `ALTER TABLE payments ADD COLUMN refund_status TEXT DEFAULT NULL`,
      `ALTER TABLE payments ADD COLUMN refund_id TEXT DEFAULT NULL`,
    ],
  },
  {
    name: '005_wallet',
    statements: [
      `CREATE TABLE IF NOT EXISTS wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL UNIQUE,
        balance INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_wallets_email ON wallets(user_email)`,
      `CREATE TABLE IF NOT EXISTS wallet_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        reference_id TEXT,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_wallet_tx_email ON wallet_transactions(user_email)`,
      `ALTER TABLE payments ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'razorpay'`,
    ],
  },
  {
    name: '006_announcements',
    statements: [
      `CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'info',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`,
    ],
  },
  {
    name: '007_jobs_printer_name',
    statements: [
      `ALTER TABLE jobs ADD COLUMN printer_name TEXT`,
    ],
  },
  {
    name: '008_print_limits',
    statements: [
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_page_limit', '100')`,
      `CREATE TABLE IF NOT EXISTS print_exemptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL,
        extra_pages INTEGER NOT NULL,
        reason TEXT,
        granted_by TEXT NOT NULL,
        granted_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      )`,
    ],
  },
  {
    name: '009_scheduled_at',
    statements: [
      `ALTER TABLE jobs ADD COLUMN scheduled_at TEXT`,
    ],
  },
  {
    name: '010_update_email_policy_patterns',
    statements: [
      `UPDATE email_policies SET name = 'IT Department', pattern = '^[0-9]{2}it[a-z]+[0-9]{3}$', department_key = 'it' WHERE department_key = 'itub'`,
      `UPDATE email_policies SET name = 'CS Department', pattern = '^[0-9]{2}cs[a-z]+[0-9]{3}$', department_key = 'cs' WHERE department_key = 'csub'`,
      `UPDATE email_policies SET name = 'EC Department', pattern = '^[0-9]{2}ec[a-z]+[0-9]{3}$', department_key = 'ec' WHERE department_key = 'ecub'`,
    ],
  },
  {
    name: '011_notification_preferences',
    statements: [
      `CREATE TABLE IF NOT EXISTS notification_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL UNIQUE,
        email_on_completed INTEGER NOT NULL DEFAULT 1,
        email_on_failed INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  },
  {
    name: '012_operating_hours',
    statements: [
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      // Default: 8 AM to 8 PM, Mon-Sat, enabled
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('operating_hours', '{"enabled":false,"startHour":8,"endHour":20,"days":[1,2,3,4,5,6]}')`,
    ],
  },
  {
    name: '013_maintenance_log',
    statements: [
      `CREATE TABLE IF NOT EXISTS maintenance_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        printer_name TEXT,
        event_type TEXT NOT NULL,
        description TEXT NOT NULL,
        admin_email TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  },
  {
    name: '014_refresh_tokens',
    statements: [
      `CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        user_email TEXT NOT NULL,
        user_name TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_email ON refresh_tokens (user_email)`,
      `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash)`,
    ],
  },
  {
    name: '015_wallet_tx_unique_ref',
    statements: [
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_ref ON wallet_transactions(reference_id, user_email) WHERE reference_id IS NOT NULL`,
    ],
  },
];
