import { Router, Request, Response } from 'express';
import { getPrinterStatus, listPrinters, getAllPrinterStatuses } from '../services/cups';
import { getOrProbePrinter } from '../models/printer';
import { getQueueDepth, getEstimatedWaitMinutes } from '../services/queue';

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

    res.json({
      online: status.online,
      status: status.status,
      accepting: status.accepting,
      printerName: status.printerName,
      queueDepth: getQueueDepth(),
      estimatedWait: `${getEstimatedWaitMinutes()} minutes`,
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
