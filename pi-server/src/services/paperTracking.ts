import { getDb } from '../db/connection';
import { logger } from '../config/logger';
import { telegram } from './telegram';

export interface PrinterPaperStatus {
  printerName: string;
  currentCount: number;
  lowThreshold: number;
  isLow: boolean;
  lastLoadedAt: string | null;
  lastLoadedBy: string | null;
}

export interface PaperReloadResult {
  success: boolean;
  previousCount: number;
  addedCount: number;
  newCount: number;
  error?: string;
}

export interface ReloadHistoryEntry {
  id: number;
  printerName: string;
  addedCount: number;
  previousCount: number;
  newCount: number;
  loadedBy: string;
  createdAt: string;
}

/**
 * Get paper count for a printer
 * Creates entry if it doesn't exist
 */
export function getPaperStatus(printerName: string): PrinterPaperStatus {
  const db = getDb();
  
  // Get or create paper tracking entry
  let row = db.prepare('SELECT * FROM printer_paper WHERE printer_name = ?').get(printerName) as any;
  
  if (!row) {
    // Create new entry for this printer
    db.prepare(`
      INSERT INTO printer_paper (printer_name, current_count, low_threshold, updated_at)
      VALUES (?, 0, 50, datetime('now'))
    `).run(printerName);
    
    row = db.prepare('SELECT * FROM printer_paper WHERE printer_name = ?').get(printerName) as any;
  }
  
  return {
    printerName: row.printer_name,
    currentCount: row.current_count,
    lowThreshold: row.low_threshold,
    isLow: row.current_count <= row.low_threshold,
    lastLoadedAt: row.last_loaded_at,
    lastLoadedBy: row.last_loaded_by,
  };
}

/**
 * Get paper status for all tracked printers
 */
export function getAllPaperStatus(): PrinterPaperStatus[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM printer_paper ORDER BY printer_name').all() as any[];
  
  return rows.map(row => ({
    printerName: row.printer_name,
    currentCount: row.current_count,
    lowThreshold: row.low_threshold,
    isLow: row.current_count <= row.low_threshold,
    lastLoadedAt: row.last_loaded_at,
    lastLoadedBy: row.last_loaded_by,
  }));
}

/**
 * Add paper to a printer (adds to current count)
 */
export function addPaper(printerName: string, count: number, loadedBy: string): PaperReloadResult {
  if (count <= 0) {
    return {
      success: false,
      previousCount: 0,
      addedCount: 0,
      newCount: 0,
      error: 'Count must be positive',
    };
  }

  const db = getDb();
  
  // Get current count (creates entry if needed)
  const current = getPaperStatus(printerName);
  const previousCount = current.currentCount;
  const newCount = previousCount + count;
  
  // Update paper count
  db.prepare(`
    UPDATE printer_paper 
    SET current_count = ?, last_loaded_at = datetime('now'), last_loaded_by = ?, updated_at = datetime('now')
    WHERE printer_name = ?
  `).run(newCount, loadedBy, printerName);
  
  // Log reload history
  db.prepare(`
    INSERT INTO paper_reloads (printer_name, added_count, previous_count, new_count, loaded_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(printerName, count, previousCount, newCount, loadedBy);
  
  logger.info({ printerName, previousCount, addedCount: count, newCount, loadedBy }, 'Paper added');
  
  // Clear low paper alert cooldown since paper was added
  telegram.clearCooldown('paperLow');
  
  return {
    success: true,
    previousCount,
    addedCount: count,
    newCount,
  };
}

/**
 * Decrement paper count after printing
 * Called after a job completes successfully
 */
export function decrementPaper(printerName: string, pages: number): number {
  if (pages <= 0) return getPaperStatus(printerName).currentCount;
  
  const db = getDb();
  const current = getPaperStatus(printerName);
  const newCount = Math.max(0, current.currentCount - pages);
  
  db.prepare(`
    UPDATE printer_paper SET current_count = ?, updated_at = datetime('now')
    WHERE printer_name = ?
  `).run(newCount, printerName);
  
  logger.debug({ printerName, printed: pages, remaining: newCount }, 'Paper decremented');
  
  // Check if paper is now low
  if (newCount <= current.lowThreshold && newCount > 0) {
    telegram.paperLow(printerName, newCount).catch(() => {});
  }
  
  // Check if paper is empty
  if (newCount === 0) {
    telegram.paperEmpty(printerName).catch(() => {});
  }
  
  return newCount;
}

/**
 * Check if printer has enough paper for a job
 * Returns { enough, currentCount, needed }
 */
export function hasEnoughPaper(printerName: string, pagesNeeded: number): {
  enough: boolean;
  currentCount: number;
  needed: number;
  shortfall: number;
} {
  const status = getPaperStatus(printerName);
  const shortfall = Math.max(0, pagesNeeded - status.currentCount);
  
  return {
    enough: status.currentCount >= pagesNeeded,
    currentCount: status.currentCount,
    needed: pagesNeeded,
    shortfall,
  };
}

/**
 * Update low threshold for a printer
 */
export function setLowThreshold(printerName: string, threshold: number): void {
  const db = getDb();
  
  // Ensure printer exists
  getPaperStatus(printerName);
  
  db.prepare(`
    UPDATE printer_paper SET low_threshold = ?, updated_at = datetime('now')
    WHERE printer_name = ?
  `).run(threshold, printerName);
  
  logger.info({ printerName, threshold }, 'Paper low threshold updated');
}

/**
 * Get recent paper reload history
 */
export function getReloadHistory(printerName?: string, limit: number = 20): ReloadHistoryEntry[] {
  const db = getDb();
  
  let query = 'SELECT * FROM paper_reloads';
  const params: any[] = [];
  
  if (printerName) {
    query += ' WHERE printer_name = ?';
    params.push(printerName);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  
  const rows = db.prepare(query).all(...params) as any[];
  
  return rows.map(row => ({
    id: row.id,
    printerName: row.printer_name,
    addedCount: row.added_count,
    previousCount: row.previous_count,
    newCount: row.new_count,
    loadedBy: row.loaded_by,
    createdAt: row.created_at,
  }));
}

/**
 * Initialize paper tracking for known printers
 * Call this on startup after CUPS is available
 */
export async function initializePaperTracking(printers: string[]): Promise<void> {
  for (const printer of printers) {
    getPaperStatus(printer); // Creates entry if doesn't exist
  }
  logger.info({ printers }, 'Paper tracking initialized');
}
