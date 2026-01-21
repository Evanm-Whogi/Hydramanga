import { Request, Response, NextFunction } from 'express';
import { mangaProgressService, MangaProgress } from '@/services/mangaProgressService';
import { queueService } from '@/services/queueService';
import logger from '@/services/loggerService';

// SSE endpoint for streaming manga import progress
export async function streamMangaProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
  const seriesId = parseInt(req.params.id, 10);

  if (isNaN(seriesId) || seriesId <= 0) {
    res.status(400).json({ error: 'Invalid series ID' });
    return;
  }

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  // Flush headers to establish the stream immediately
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }
  // Ensure the socket does not timeout and stays alive
  if (req.socket) {
    req.socket.setTimeout(0);
    req.socket.setKeepAlive(true);
  }

  let closed = false;
  const safeWrite = (chunk: string) => {
    if (closed || res.writableEnded) return false;
    try {
      return res.write(chunk);
    } catch {
      return false;
    }
  };

  // Send initial connection message
  safeWrite('data: {"type":"connected"}\n\n');

  logger.info(`SSE connection established for series ${seriesId}`, { service: 'progressController' });

  // Get current progress and send immediately
  const currentProgress = await mangaProgressService.getProgress(seriesId);
  if (currentProgress) {
    safeWrite(`data: ${JSON.stringify({ type: 'progress', data: currentProgress })}\n\n`);
  } else {
    safeWrite(`data: ${JSON.stringify({ type: 'no-progress' })}\n\n`);
  }

  // Create Redis subscriber for real-time updates
  const redis = queueService.getRedisClient();
  const subscriber = redis.duplicate();
  
  try {
    const channel = `manga:progress:${seriesId}`;
    let heartbeatInterval: NodeJS.Timeout;
    
    const safeCleanup = async () => {
      if (closed) return;
      closed = true;
      try { clearInterval(heartbeatInterval); } catch {}
      try { await subscriber.unsubscribe(channel); } catch {}
      try { subscriber.disconnect(); } catch {}
      try { res.end(); } catch {}
    };

    subscriber.on('error', (err: any) => {
      logger.warn(`Redis subscriber error for series ${seriesId}: ${err?.message || err}`, { service: 'progressController' });
    });
    
    subscriber.on('message', (ch: string, message: string) => {
      if (ch === channel) {
        try {
          const progress: MangaProgress = JSON.parse(message);
          
          // Send progress update to client
          safeWrite(`data: ${JSON.stringify({ type: 'progress', data: progress })}\n\n`);
          
          // Auto-close connection if completed or failed
          if (progress.status === 'completed' || progress.status === 'failed') {
            logger.info(`Import ${progress.status} for series ${seriesId}, closing SSE connection`, { service: 'progressController' });
            setTimeout(async () => {
              safeWrite(`data: ${JSON.stringify({ type: 'done', data: progress })}\n\n`);
              await safeCleanup();
            }, 1000); // Give client 1 second to receive final update
          }
        } catch (error) {
          logger.error(`Error processing progress message for series ${seriesId}: ${error}`, { service: 'progressController' });
        }
      }
    });
    
    await subscriber.subscribe(channel);

    logger.info(`Subscribed to progress channel for series ${seriesId}`, { service: 'progressController' });

    // Send heartbeat every 15 seconds to keep connection alive
    heartbeatInterval = setInterval(() => {
      if (!safeWrite(': heartbeat\n\n')) {
        try { clearInterval(heartbeatInterval); } catch {}
      }
    }, 15000);

    // Cleanup on client disconnect
    const onClose = async () => {
      await safeCleanup();
      logger.info(`SSE connection closed for series ${seriesId}`, { service: 'progressController' });
    };
    req.on('close', onClose);
    res.on('finish', onClose);
    res.on('error', onClose);

  } catch (error) {
    logger.error(`Failed to setup SSE for series ${seriesId}: ${error}`, { service: 'progressController' });
    try { subscriber.disconnect(); } catch {}
    try { res.end(); } catch {}
  }
}

// Get current progress (REST endpoint for polling fallback)
export async function getMangaProgress(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  const seriesId = parseInt(req.params.id, 10);

  if (isNaN(seriesId) || seriesId <= 0) {
    return res.status(400).json({ error: 'Invalid series ID' });
  }

  try {
    const progress = await mangaProgressService.getProgress(seriesId);
    
    if (!progress) {
      return res.status(404).json({ error: 'No progress found for this series' });
    }

    return res.json(progress);
  } catch (error) {
    logger.error(`Failed to get progress for series ${seriesId}: ${error}`, { service: 'progressController' });
    return res.status(500).json({ error: 'Failed to retrieve progress' });
  }
}
