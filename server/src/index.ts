import express, { Express } from 'express';
import 'tsconfig-paths/register';
import cors from 'cors';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import dotenv from 'dotenv';
import logger from '@/services/loggerService';
import { toNodeHandler } from "better-auth/node";
import { auth } from '@/utils/auth';

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

dotenv.config();

// Middlewares
import { rateLimiter } from '@/middlewares/rateLimit';
import { isMaintenance } from '@/middlewares/maintenance';

// Services
import '@/services/loggerService';
import '@/services/queueService';
import { queueService } from '@/services/queueService';

// import '@/services/cacheService';

// Constants
const app: Express = express();

app.use(morgan(':method :url :status :response-time ms - :res[content-length] \n', {
    skip: (req, res) => req.originalUrl.startsWith('/admin/queues') || req.originalUrl.startsWith('/manga-files') // Skip logging for Bull Board routes
}));

app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://localhost:3001'], credentials: true }));

// Bull Board Setup
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(queueService.getQueue('mangaChapterDownloadQueue')),
    new BullMQAdapter(queueService.getQueue('emailQueue'))
  ],
  serverAdapter: serverAdapter,
});
  
app.use('/admin/queues', serverAdapter.getRouter());
app.use('/manga-files', express.static('/home/whogi/projects/mang/server'));
// Auth Routes
app.all("/auth/{*any}", toNodeHandler(auth));

// Middlewares
app.use(bodyParser.json());
app.use(isMaintenance);
process.env.NODE_ENV === 'production' ? app.use(rateLimiter) : null; // Rate limit

// Routes
require('@/routes')(app);

// Error Handler
app.use((err: Error, req: any, res: any, next: any) => {
  logger.error(err);
  res.status(500).send(err);
});

// Server
app.listen(process.env.PORT, () => {
  console.log(`Server is running on port: ${process.env.APP_URL}`);
});