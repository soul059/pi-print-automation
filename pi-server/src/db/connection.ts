import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';
import { logger } from '../config/logger';

let db: SqlJsDatabase | null = null;

// Wrapper that provides a better-sqlite3-like API on top of sql.js
export interface DbWrapper {
  exec(sql: string): void;
  prepare(sql: string): StatementWrapper;
  close(): void;
}

export interface StatementWrapper {
  run(...params: any[]): { changes: number; lastInsertRowid: number };
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

function createStatementWrapper(db: SqlJsDatabase, sql: string): StatementWrapper {
  return {
    run(...params: any[]) {
      db.run(sql, params);
      const changes = db.getRowsModified();
      const lastRow = db.exec('SELECT last_insert_rowid() as id');
      const lastInsertRowid = lastRow.length > 0 ? (lastRow[0].values[0][0] as number) : 0;
      saveDb();
      return { changes, lastInsertRowid };
    },
    get(...params: any[]) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      if (stmt.step()) {
        const cols = stmt.getColumnNames();
        const vals = stmt.get();
        stmt.free();
        const row: any = {};
        cols.forEach((col: string, i: number) => { row[col] = vals[i]; });
        return row;
      }
      stmt.free();
      return undefined;
    },
    all(...params: any[]) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const results: any[] = [];
      while (stmt.step()) {
        const cols = stmt.getColumnNames();
        const vals = stmt.get();
        const row: any = {};
        cols.forEach((col: string, i: number) => { row[col] = vals[i]; });
        results.push(row);
      }
      stmt.free();
      return results;
    },
  };
}

let dbWrapper: DbWrapper | null = null;

function saveDb(): void {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    // Atomic write: write to temp file then rename (prevents corruption on power loss)
    const tmpPath = env.DB_PATH + '.tmp';
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, env.DB_PATH);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to save database');
  }
}

// Periodic backup — keeps a .bak copy every 5 minutes
let backupInterval: ReturnType<typeof setInterval> | null = null;

function startBackup(): void {
  backupInterval = setInterval(() => {
    try {
      if (fs.existsSync(env.DB_PATH)) {
        fs.copyFileSync(env.DB_PATH, env.DB_PATH + '.bak');
      }
    } catch (err: any) {
      logger.error({ err: err.message }, 'DB backup failed');
    }
  }, 5 * 60 * 1000);
}

function stopBackup(): void {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
}

export async function initDb(): Promise<DbWrapper> {
  if (dbWrapper) return dbWrapper;

  const dbDir = path.dirname(env.DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(env.DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(env.DB_PATH);
      db = new SQL.Database(fileBuffer);
      logger.info({ path: env.DB_PATH }, 'Database loaded from file');
    } catch (loadErr: any) {
      // Main DB corrupted — try loading from temp backup, then .bak
      const tmpPath = env.DB_PATH + '.tmp';
      const bakPath = env.DB_PATH + '.bak';
      if (fs.existsSync(tmpPath)) {
        logger.warn({ err: loadErr.message }, 'Main DB corrupted, loading from temp file');
        const tmpBuffer = fs.readFileSync(tmpPath);
        db = new SQL.Database(tmpBuffer);
      } else if (fs.existsSync(bakPath)) {
        logger.warn({ err: loadErr.message }, 'Main DB corrupted, loading from backup');
        const bakBuffer = fs.readFileSync(bakPath);
        db = new SQL.Database(bakBuffer);
      } else {
        throw loadErr;
      }
    }
  } else {
    db = new SQL.Database();
    logger.info({ path: env.DB_PATH }, 'New database created');
  }

  db.run('PRAGMA foreign_keys = ON');

  // Start periodic backup
  startBackup();

  dbWrapper = {
    exec(sql: string) {
      db!.run(sql);
      saveDb();
    },
    prepare(sql: string) {
      return createStatementWrapper(db!, sql);
    },
    close() {
      if (db) {
        stopBackup();
        saveDb();
        db.close();
        db = null;
        dbWrapper = null;
        logger.info('Database closed');
      }
    },
  };

  return dbWrapper;
}

export function getDb(): DbWrapper {
  if (!dbWrapper) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbWrapper;
}

export function closeDb(): void {
  if (dbWrapper) {
    dbWrapper.close();
  }
}
