import { Router, Request, Response } from 'express';
import { getPrinterStatus, listPrinters } from '../services/cups';
import { getOrProbePrinter } from '../models/printer';
import { getQueueDepth, getEstimatedWaitMinutes } from '../services/queue';

export const printerRouter = Router();

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

printerRouter.get('/list', async (_req: Request, res: Response) => {
  const printers = await listPrinters();
  res.json({ printers });
});
