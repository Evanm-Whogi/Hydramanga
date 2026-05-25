import express, { Express } from 'express';
import 'tsconfig-paths/register';
import cors from 'cors';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { toNodeHandler } from "better-auth/node";
import { auth } from '@/utils/auth';
import http from 'http';
import { Server } from 'socket.io';
import { setupProgressSocket } from '@/sockets/progressSocket';
import { setupChatSocket } from '@/sockets/chatSocket';
import { karmaService } from '@/services/karmaService';
import { readingActivityService } from '@/services/readingActivityService';
import * as Sentry from "@sentry/node";
import { initSentry } from "@/sentry";
dotenv.config();

// Initialize Sentry if enabled
if (process.env.ENABLE_SENTRY === 'true') {
    initSentry();
}

// Middlewares
import { rateLimiter } from '@/middlewares/rateLimit';
import { isMaintenance } from '@/middlewares/maintenance';
// Services
import '@/services/loggerService';
import '@/services/queueService';
import { queueService } from '@/services/queueService';
import { initializeScrapers } from '@/scrapers';
import logger from '@/services/loggerService';

// Initialize scrapers so admin scraper-search API can query all sources (worker has its own instance)
initializeScrapers();

// Constants
const app: Express = express();

app.use(morgan(':method :url :status :response-time ms - :res[content-length] \n', {
    skip: (req, res) => req.originalUrl.includes('/admin/heartbeat') || req.originalUrl.includes('/socket.io')
}));
const corsOrigins = ['https://manga.chit.sh', process.env.PUBLIC_APP_URL].filter(Boolean) as string[];
app.use(cors({ origin: corsOrigins, credentials: true }));
app.set('trust proxy', 1);

// Auth Routes
app.all("/auth/{*any}", toNodeHandler(auth));

// Middlewares
app.use(bodyParser.json());
app.use(isMaintenance);

// Enable rate limiting only in production [Disabled]
// if (process.env.NODE_ENV === 'production') {
//     app.use(rateLimiter);
// }

// Routes
require('@/routes')(app);

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
    origin: corsOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
});

// Setup WebSocket namespaces
setupProgressSocket(io);
setupChatSocket(io);

void karmaService.ensureBackfilled().then(() => readingActivityService.ensureBackfilled());

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
    // Close queue connections (no workers on server)
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