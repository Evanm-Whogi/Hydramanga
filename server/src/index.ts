import express, { Express } from 'express';
import 'tsconfig-paths/register';
import cors from 'cors';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { toNodeHandler } from "better-auth/node";
import { auth } from '@/utils/auth';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { initCronJobs, stopCronJobs } from '@/jobs/cron';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';
import { setupProgressSocket } from '@/sockets/progressSocket';
import * as Sentry from "@sentry/node";
import { initSentry } from "@/sentry";

dotenv.config();

// Initialize Sentry
initSentry();

// Middlewares
import { rateLimiter } from '@/middlewares/rateLimit';
import { isMaintenance } from '@/middlewares/maintenance';

// Services
import '@/services/loggerService';
import '@/services/queueService';
import { queueService } from '@/services/queueService';
import logger from '@/services/loggerService';
import { initializeScrapers } from '@/scrapers';

// Constants
const app: Express = express();

app.use(morgan(':method :url :status :response-time ms - :res[content-length] \n', {
    skip: (req, res) => req.originalUrl.startsWith('/admin/queues') || req.originalUrl.startsWith('/manga-files') // Skip logging for Bull Board routes
}));
app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://localhost:3001', 'https://manga.chit.sh'], credentials: true }));
app.set('trust proxy', 1);
const chapterStaticRoot = process.env.CHAPTER_STORAGE_ROOT || path.join(process.cwd(), 'chapters');

// Bull Board Setup
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(queueService.getQueue('mangaImportQueue')),
    new BullMQAdapter(queueService.getQueue('mangaChapterImportQueue')),
    new BullMQAdapter(queueService.getQueue('mangaChapterDownloadQueue')),
    new BullMQAdapter(queueService.getQueue('emailQueue'))
  ],
  serverAdapter: serverAdapter,
});
  
app.use('/admin/queues', serverAdapter.getRouter());
app.use('/manga-files', express.static(chapterStaticRoot));

// Auth Routes
app.all("/auth/{*any}", toNodeHandler(auth));

// Middlewares
app.use(bodyParser.json());
app.use(isMaintenance);

// Enable rate limiting only in production
if (process.env.NODE_ENV === 'production') {
    app.use(rateLimiter);
}

// Routes
require('@/routes')(app);

// Initialize scrapers (must be done before cron jobs)
initializeScrapers();

// Cron jobs (trending rescans, etc.)
initCronJobs();

// Error Handler
app.use((err: Error, req: any, res: any, next: any) => {
  logger.error(err);
  Sentry.captureException(err);
  res.status(500).send({ error: err.message || 'Internal Server Error' });
});

// Server - use http.createServer instead of app.listen for Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  path: '/socket.io/',
  cors: {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://localhost:3001', 'https://manga.chit.sh'],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
});

// Setup WebSocket namespaces
setupProgressSocket(io);

logger.info('Socket.IO server initialized with transports: websocket, polling', { service: 'server' });

// Start server
server.listen(process.env.PORT, () => {
  logger.info(`Server is running on port: ${process.env.PORT}`, { service: 'server' });
  logger.info(`Socket.IO endpoint available at http://localhost:${process.env.PORT}/socket.io/`, { service: 'server' });
});

// Graceful Shutdown
const gracefulShutdown = async () => {
  logger.info('Received shutdown signal, starting graceful shutdown...');

  // Close Socket.IO first
  try {
    io.close();
    logger.info('Socket.IO closed');
  } catch (error) {
    logger.warn(`Error closing Socket.IO: ${error}`);
  }

  // Close HTTP server
  server.close(() => {
    logger.info('HTTP server closed');
  });

  try {
    // Stop cron jobs
    stopCronJobs();
    logger.info('Cron jobs stopped');

    // Close queue workers and connections
    await queueService.closeAll();
    logger.info('Queue service closed');

    // Close database pool
    const { pool } = await import('@/db/index');
    await pool.end();
    logger.info('Database pool closed');

    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error(`Error during shutdown: ${error}`);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);