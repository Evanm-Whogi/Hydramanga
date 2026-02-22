import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { mangaProgressService, MangaProgress } from '@/services/mangaProgressService';
import logger from '@/services/loggerService';
import { setIOInstance } from '@/sockets/socketManager';
import { appConfig } from '@/config/appConfig';

const PROGRESS_CHANNEL_PREFIX = 'manga:progress:';

/**
 * Start Redis subscriber so progress updates published by the worker are forwarded to WebSocket clients.
 * Worker has no Socket.IO; it only publishes to Redis. Server subscribes here and emits to the /progress namespace.
 */
function startProgressRedisSubscriber(io: Server) {
  const subscriber = new Redis({
    host: appConfig.redis.host,
    port: appConfig.redis.port,
    password: appConfig.redis.password,
    ...(appConfig.redis.db != null && { db: appConfig.redis.db }),
  });

  subscriber.psubscribe('manga:progress:*', (err) => {
    if (err) {
      logger.error(`Progress Redis psubscribe error: ${err}`, { service: 'progressSocket' });
      return;
    }
    logger.info('Subscribed to Redis progress channel manga:progress:*', { service: 'progressSocket' });
  });

  subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
    try {
      const seriesIdStr = channel.slice(PROGRESS_CHANNEL_PREFIX.length);
      const seriesId = parseInt(seriesIdStr, 10);
      if (Number.isNaN(seriesId)) return;

      const data = JSON.parse(message) as MangaProgress;
      const room = `manga:progress:${seriesId}`;
      const payload = { type: 'progress' as const, data };

      io.of('/progress').to(room).emit('progress', payload);

      if (data.status === 'completed' || data.status === 'failed') {
        const donePayload = { type: 'done' as const, data };
        io.of('/progress').to(room).emit('progress', donePayload);
        logger.info(`Import ${data.status} for series ${seriesId}, forwarded from Redis to WebSocket`, {
          service: 'progressSocket',
        });
      }
    } catch (e) {
      logger.error(`Progress Redis pmessage parse error: ${e}`, { service: 'progressSocket' });
    }
  });

  subscriber.on('error', (err) => {
    logger.error(`Progress Redis subscriber error: ${err}`, { service: 'progressSocket' });
  });
}

/**
 * WebSocket namespace handler for real-time manga import progress
 * Replaces SSE streaming with bidirectional WebSocket communication
 */
export function setupProgressSocket(io: Server) {
  // Store the Socket.IO instance globally for use in services (in-process emits)
  setIOInstance(io);

  // Forward Redis progress updates from worker to WebSocket clients
  startProgressRedisSubscriber(io);

  const progressNamespace = io.of('/progress');

  progressNamespace.on('connection', (socket: Socket) => {
    logger.info(`WebSocket client connected: ${socket.id}`, { service: 'progressSocket' });

    /**
     * Client joins a room to listen for progress updates on a specific manga
     * Format: manga:progress:${seriesId}
     */
    socket.on('subscribe', async (data: { seriesId: number }, callback?: (response: any) => void) => {
      const { seriesId } = data;

      if (!seriesId || isNaN(seriesId) || seriesId <= 0) {
        logger.warn(`Invalid seriesId in subscribe: ${seriesId}`, { service: 'progressSocket' });
        if (callback) {
          callback({ success: false, error: 'Invalid series ID' });
        }
        return;
      }

      const room = `manga:progress:${seriesId}`;

      try {
        // Join the room for this manga
        socket.join(room);
        logger.info(`Client ${socket.id} subscribed to ${room}`, { service: 'progressSocket' });

        // Send current progress immediately
        const currentProgress = await mangaProgressService.getProgress(seriesId);
        const response = currentProgress
          ? { type: 'progress', data: currentProgress }
          : { type: 'no-progress' };

        // Send to the specific socket
        socket.emit('progress', response);

        if (callback) {
          callback({ success: true, status: currentProgress?.status || 'no-progress' });
        }
      } catch (error) {
        logger.error(`Error subscribing to progress for series ${seriesId}: ${error}`, {
          service: 'progressSocket',
        });
        if (callback) {
          callback({ success: false, error: 'Failed to subscribe' });
        }
      }
    });

    /**
     * Client unsubscribes from a specific manga's progress room
     */
    socket.on('unsubscribe', (data: { seriesId: number }, callback?: (response: any) => void) => {
      const { seriesId } = data;

      if (!seriesId || isNaN(seriesId) || seriesId <= 0) {
        if (callback) {
          callback({ success: false, error: 'Invalid series ID' });
        }
        return;
      }

      const room = `manga:progress:${seriesId}`;
      socket.leave(room);
      logger.info(`Client ${socket.id} unsubscribed from ${room}`, { service: 'progressSocket' });

      if (callback) {
        callback({ success: true });
      }
    });

    /**
     * Handle client disconnect
     */
    socket.on('disconnect', () => {
      logger.info(`WebSocket client disconnected: ${socket.id}`, { service: 'progressSocket' });
    });

    /**
     * Handle connection errors
     */
    socket.on('error', (error: any) => {
      logger.error(`WebSocket error for client ${socket.id}: ${error}`, { service: 'progressSocket' });
    });
  });

  return progressNamespace;
}

/**
 * Broadcast a progress update to all clients listening on a specific manga
 * Called from progress service when state changes occur
 */
export function broadcastProgressUpdate(io: Server, seriesId: number, progress: MangaProgress) {
  const room = `manga:progress:${seriesId}`;
  const message = { type: 'progress', data: progress };

  io.of('/progress').to(room).emit('progress', message);

  logger.debug(`Broadcast progress to ${room}: ${progress.status}`, { service: 'progressSocket' });

  // Auto-close connection when import completes or fails
  if (progress.status === 'completed' || progress.status === 'failed') {
    const doneMessage = { type: 'done', data: progress };
    io.of('/progress').to(room).emit('progress', doneMessage);
    logger.info(`Import ${progress.status} for series ${seriesId}, broadcasting close signal`, {
      service: 'progressSocket',
    });
  }
}
