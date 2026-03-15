import { Router, Request, Response } from 'express';
import { getPrinterStatus, listPrinters, getAllPrinterStatuses, getSupplyLevels } from '../services/cups';
import { getOrProbePrinter } from '../models/printer';
import { getQueueDepth, getEstimatedWaitMinutes } from '../services/queue';
import { isWithinOperatingHours } from '../services/settings';
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
