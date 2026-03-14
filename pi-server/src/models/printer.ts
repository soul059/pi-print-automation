import { getDb } from '../db/connection';
import { getPrinterCapabilities, listPrinters, getDefaultPrinter } from '../services/cups';
import { logger } from '../config/logger';

export interface PrinterProfile {
  id: number;
  printer_name: string;
  display_name: string | null;
  supports_color: number;
  supports_duplex: number;
  paper_sizes: string; // JSON array
  default_paper_size: string;
  capabilities_json: string | null;
  last_probed_at: string | null;
}

export async function probeAndCachePrinter(printerName: string): Promise<PrinterProfile | null> {
  const db = getDb();

  try {
    const caps = await getPrinterCapabilities(printerName);
    const supportsColor = caps['ColorModel']?.includes('Color') ? 1 : 0;
    const supportsDuplex = caps['Duplex']?.includes('DuplexNoTumble') ? 1 : 0;

    // Parse paper sizes from media options
    let paperSizes = ['A4'];
    if (caps['PageSize']) {
      paperSizes = caps['PageSize']
        .split(/\s+/)
        .map((s) => s.replace(/\*/g, ''))
        .filter(Boolean);
    }

    const capsJson = JSON.stringify(caps);

    db.prepare(
      `INSERT INTO printer_profiles (printer_name, supports_color, supports_duplex, paper_sizes, capabilities_json, last_probed_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(printer_name) DO UPDATE SET
         supports_color = excluded.supports_color,
         supports_duplex = excluded.supports_duplex,
         paper_sizes = excluded.paper_sizes,
         capabilities_json = excluded.capabilities_json,
         last_probed_at = datetime('now'),
         updated_at = datetime('now')`
    ).run(printerName, supportsColor, supportsDuplex, JSON.stringify(paperSizes), capsJson);

    logger.info({ printerName, supportsColor, supportsDuplex, paperSizes }, 'Printer probed');
    return db
      .prepare('SELECT * FROM printer_profiles WHERE printer_name = ?')
      .get(printerName) as PrinterProfile;
  } catch (err: any) {
    logger.warn({ printerName, err: err.message }, 'Printer probe failed, using defaults');

    // Insert safe defaults
    db.prepare(
      `INSERT OR IGNORE INTO printer_profiles (printer_name, supports_color, supports_duplex, paper_sizes)
       VALUES (?, 0, 0, '["A4"]')`
    ).run(printerName);

    return db
      .prepare('SELECT * FROM printer_profiles WHERE printer_name = ?')
      .get(printerName) as PrinterProfile;
  }
}

export function getCachedProfile(printerName: string): PrinterProfile | null {
  const db = getDb();
  return (
    (db
      .prepare('SELECT * FROM printer_profiles WHERE printer_name = ?')
      .get(printerName) as PrinterProfile) || null
  );
}

export async function getOrProbePrinter(printerName?: string): Promise<PrinterProfile | null> {
  const name = printerName || (await getDefaultPrinter());
  if (!name) return null;

  const cached = getCachedProfile(name);
  if (cached && cached.last_probed_at) {
    // Re-probe if cache is older than 1 hour
    const lastProbed = new Date(cached.last_probed_at).getTime();
    if (Date.now() - lastProbed < 3600000) return cached;
  }

  return probeAndCachePrinter(name);
}
