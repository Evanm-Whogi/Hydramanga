import express, { Express } from 'express';
import 'tsconfig-paths/register';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { toNodeHandler } from "better-auth/node";
import { auth } from '@/utils/auth';
import { auditAuthHandler } from '@/middlewares/auditAuthHandler';
import { trackingMiddleware } from '@/middlewares/tracking';
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
import { rateLimiter, authRateLimiter } from '@/middlewares/rateLimit';
import { isMaintenance } from '@/middlewares/maintenance';
import { oauthSettingsMiddleware } from '@/middlewares/oauthSettingsMiddleware';
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

// Morgan
morgan.token("username", (req) => {return (req as any).user?.username || "Unknown"});
morgan.token("ip", (req) => {return (req as any).ip || "Unknown"});
app.use(morgan(':username [:ip] :\n:method :url :status :response-time ms\n', {
    skip: (req, res) => req.originalUrl.includes('/heartbeat') || req.originalUrl.includes('/socket.io')
}));

const corsOrigins = ['https://manga.chit.sh', process.env.PUBLIC_APP_URL].filter(Boolean) as string[];
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);
app.set('trust proxy', 1);

// Auth Routes (tracking for IP/UA on auth events)
app.use('/auth', trackingMiddleware);
app.use('/auth', oauthSettingsMiddleware);
app.use(['/auth/sign-in', '/auth/sign-up', '/auth/forget-password', '/auth/reset-password', '/auth/request-password-reset'], authRateLimiter);
app.all("/auth/{*any}", auditAuthHandler(toNodeHandler(auth)));

// Middlewares
app.use(express.json({ limit: '256kb' }));
app.use(isMaintenance);

// Routes
require('@/routes')(app);

// Error Handler
app.use((err: Error, req: any, res: any, next: any) => {
  logger.error(err);
  Sentry.captureException(err);
  // Avoid leaking internal error details (stack/paths) to clients in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error');
  res.status(500).send({ error: message });
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