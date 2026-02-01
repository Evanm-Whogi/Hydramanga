import { Server, Socket } from 'socket.io';
import { mangaProgressService, MangaProgress } from '@/services/mangaProgressService';
import logger from '@/services/loggerService';
import { setIOInstance } from '@/sockets/socketManager';

/**
 * WebSocket namespace handler for real-time manga import progress
 * Replaces SSE streaming with bidirectional WebSocket communication
 */
export function setupProgressSocket(io: Server) {
  // Store the Socket.IO instance globally for use in services
  setIOInstance(io);

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
