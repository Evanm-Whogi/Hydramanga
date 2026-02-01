import { Request, Response, NextFunction } from 'express';
import { mangaProgressService } from '@/services/mangaProgressService';
import logger from '@/services/loggerService';

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
