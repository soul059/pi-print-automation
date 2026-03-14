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
    fs.writeFileSync(env.DB_PATH, buffer);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to save database');
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
    const fileBuffer = fs.readFileSync(env.DB_PATH);
    db = new SQL.Database(fileBuffer);
    logger.info({ path: env.DB_PATH }, 'Database loaded from file');
  } else {
    db = new SQL.Database();
    logger.info({ path: env.DB_PATH }, 'New database created');
  }

  db.run('PRAGMA foreign_keys = ON');

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
