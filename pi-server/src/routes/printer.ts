import { Router, Request, Response } from 'express';
import { getPrinterStatus, listPrinters, getAllPrinterStatuses, getSupplyLevels } from '../services/cups';
import { getOrProbePrinter } from '../models/printer';
import { getQueueDepth, getEstimatedWaitMinutes } from '../services/queue';
import { isWithinOperatingHours } from '../services/settings';
import { getDb } from '../db/connection';
import { env } from '../config/env';

export const printerRouter = Router();

// Public: list all printers with status
printerRouter.get('/list', async (_req: Request, res: Response) => {
  try {
    const statuses = await getAllPrinterStatuses();
    res.json({
      printers: statuses.map((s) => ({
        name: s.printerName,
        online: s.online,
        status: s.status,
        accepting: s.accepting,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ printers: [], error: err.message });
  }
});

// Public: pricing config for client-side cost estimation
printerRouter.get('/pricing', (_req: Request, res: Response) => {
  res.json({
    bwPerPage: env.PRICE_BW_PER_PAGE,
    colorPerPage: env.PRICE_COLOR_PER_PAGE,
    duplexDiscount: env.DUPLEX_DISCOUNT,
    currency: 'INR',
  });
});

printerRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await getPrinterStatus();
    const profile = await getOrProbePrinter(status.printerName || undefined);

    let paperSizes = ['A4'];
    let supportsColor = false;
    let supportsDuplex = false;

    if (profile) {
      try {
        paperSizes = JSON.parse(profile.paper_sizes);
      } catch {
        paperSizes = ['A4'];
      }
      supportsColor = profile.supports_color === 1;
      supportsDuplex = profile.supports_duplex === 1;
    }

    const operatingHours = isWithinOperatingHours();

    res.json({
      online: status.online,
      status: status.status,
      accepting: status.accepting,
      printerName: status.printerName,
      queueDepth: getQueueDepth(),
      estimatedWait: `${getEstimatedWaitMinutes()} minutes`,
      operatingHours,
      capabilities: {
        color: supportsColor,
        duplex: supportsDuplex,
        paperSizes,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      online: false,
      status: 'error',
      error: err.message,
    });
  }
});

// Public: supply levels (ink/toner/paper)
printerRouter.get('/supplies', async (req: Request, res: Response) => {
  try {
    const printerName = req.query.printer as string | undefined;
    const supplies = await getSupplyLevels(printerName);
    res.json({ supplies });
  } catch (err: any) {
    res.json({ supplies: [], error: err.message });
  }
});

// Public: department usage leaderboard (anonymous)
printerRouter.get('/leaderboard', (_req: Request, res: Response) => {
  try {
    const db = getDb();

    // Match user emails to department policies for aggregation
    const policies = db.prepare('SELECT name, domain, pattern, department_key FROM email_policies WHERE active = 1').all() as any[];

    // Get all completed job stats grouped by email
    const userStats = db.prepare(
      `SELECT user_email,
              COUNT(*) as jobs,
              COALESCE(SUM(total_pages * copies), 0) as pages,
              COALESCE(SUM(price), 0) as spent
       FROM jobs WHERE status = 'completed'
       GROUP BY user_email`
    ).all() as any[];

    // Aggregate by department
    const deptStats: Record<string, { name: string; jobs: number; pages: number; users: Set<string> }> = {};

    for (const user of userStats) {
      const email = user.user_email as string;
      const atIdx = email.indexOf('@');
      if (atIdx === -1) continue;
      const local = email.slice(0, atIdx).toLowerCase();
      const domain = email.slice(atIdx + 1).toLowerCase();

      let deptName = 'Other';
      for (const policy of policies) {
        if (policy.domain !== domain) continue;
        try {
          if (new RegExp(policy.pattern).test(local)) {
            deptName = policy.name;
            break;
          }
        } catch { /* ignore bad regex */ }
      }

      if (!deptStats[deptName]) {
        deptStats[deptName] = { name: deptName, jobs: 0, pages: 0, users: new Set() };
      }
      deptStats[deptName].jobs += user.jobs;
      deptStats[deptName].pages += user.pages;
      deptStats[deptName].users.add(email);
    }

    const leaderboard = Object.values(deptStats)
      .map(d => ({ name: d.name, jobs: d.jobs, pages: d.pages, users: d.users.size }))
      .sort((a, b) => b.pages - a.pages);

    // Global stats
    const globalRow = db.prepare(
      `SELECT COUNT(*) as totalJobs,
              COALESCE(SUM(total_pages * copies), 0) as totalPages
       FROM jobs WHERE status = 'completed'`
    ).get() as any;

    res.json({
      leaderboard,
      global: {
        totalJobs: globalRow?.totalJobs ?? 0,
        totalPages: globalRow?.totalPages ?? 0,
      },
    });
  } catch (err: any) {
    res.json({ leaderboard: [], global: { totalJobs: 0, totalPages: 0 }, error: err.message });
  }
});
