import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { env } from './config/env';
import { logger } from './config/logger';
import { uploadRouter } from './routes/upload';
import { paymentRouter } from './routes/payment';
import { printerRouter } from './routes/printer';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { jobsRouter } from './routes/jobs';
import { walletRouter } from './routes/wallet';
import { announcementsRouter } from './routes/announcements';
import { userRouter } from './routes/user';
import { errorHandler } from './middleware/errorHandler';
import { setupPrinterStatusBroadcast } from './services/printerStatus';

const app = express();
const httpServer = createServer(app);

const io = new SocketServer(httpServer, {
  cors: {
    origin: env.CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
// Capture raw body for webhook signature verification
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
}));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/printer', printerRouter);
app.use('/api/printers', printerRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/user', userRouter);

// Error handler
app.use(errorHandler);

// Printer status broadcast (handles socket connections internally)
setupPrinterStatusBroadcast(io);

export { app, httpServer, io };
