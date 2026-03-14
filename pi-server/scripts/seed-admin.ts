/**
 * Seed an admin user into the database.
 * Usage: npx tsx scripts/seed-admin.ts <username> <password> [displayName]
 */
import { initDb, getDb, closeDb } from '../src/db/connection';
import { runMigrations } from '../src/db/migrations';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npx tsx scripts/seed-admin.ts <username> <password> [displayName]');
    console.log('Example: npx tsx scripts/seed-admin.ts admin MySecurePass123 "Admin User"');
    process.exit(1);
  }

  const [username, password, displayName] = args;

  if (password.length < 8) {
    console.error('Error: Password must be at least 8 characters');
    process.exit(1);
  }

  // Ensure data directory exists
  const dataDir = path.resolve(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  await initDb();
  runMigrations();

  const db = getDb();
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username) as any;

  if (existing) {
    console.log(`Admin "${username}" already exists. Updating password...`);
    const hash = await bcrypt.hash(password, 12);
    db.prepare(
      "UPDATE admins SET password_hash = ?, display_name = ?, updated_at = datetime('now') WHERE username = ?"
    ).run(hash, displayName || username, username);
    console.log(`✅ Admin "${username}" password updated.`);
  } else {
    const hash = await bcrypt.hash(password, 12);
    db.prepare(
      'INSERT INTO admins (username, password_hash, display_name) VALUES (?, ?, ?)'
    ).run(username, hash, displayName || username);
    console.log(`✅ Admin "${username}" created successfully.`);
  }

  closeDb();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
