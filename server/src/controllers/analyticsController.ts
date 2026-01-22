import { Request, Response, NextFunction } from 'express';
import { metricsService } from '@/services/metricsService';
import { userProgressService } from '@/services/userProgressService';
import logger from '@/services/loggerService';

/**
 * Get trending manga for a specific time period
 */
export async function getTrending(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { period = 'week', limit = '20' } = req.query;
    
    // Map period to days
    const periodToDays: { [key: string]: number } = {
      'day': 1,
      'week': 7,
      'month': 30,
      'quarter': 90,
      'year': 365,
    };

    const days = periodToDays[String(period)] || 7;
    const maxLimit = Math.min(Number(limit), 100);

    const trending = await metricsService.getTrendingManga(days, maxLimit);
    const trendingList = Array.isArray(trending) ? trending : [];

    return res.json({
      status: 200,
      period: String(period),
      days,
      count: trendingList.length,
      manga: trendingList,
    });
  } catch (error) {
    logger.error(`Failed to get trending manga: ${error}`, { service: 'analyticsController' });
    return next(error);
  }
}

/**
 * Get view statistics for a specific manga
 */
export async function getMangaAnalytics(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const seriesId = parseInt(req.params.id, 10);

    if (isNaN(seriesId)) {
      return res.status(400).json({ error: 'Invalid series ID' });
    }

    const [mangaStats, chapterStats] = await Promise.all([
      metricsService.getMangaStats(seriesId),
      metricsService.getSeriesChapterStats(seriesId),
    ]);

    // Disable browser caching for analytics - ensure fresh data
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    return res.json({
      status: 200,
      seriesId,
      stats: {
        manga: mangaStats,
        chapters: chapterStats,
      },
    });
  } catch (error) {
    logger.error(`Failed to get manga analytics: ${error}`, { service: 'analyticsController' });
    return next(error);
  }
}

/**
 * Get reading progress for the authenticated user
 */
export async function getMyProgress(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { limit = '20' } = req.query;
    const maxLimit = Math.min(Number(limit), 100);

    const progress = await userProgressService.getUserProgress(userId, maxLimit);
    const progressList = Array.isArray(progress) ? progress : [];

    return res.json({
      status: 200,
      count: progressList.length,
      progress: progressList,
    });
  } catch (error) {
    logger.error(`Failed to get user progress: ${error}`, { service: 'analyticsController' });
    return next(error);
  }
}

/**
 * Get reading progress for a specific manga
 */
export async function getMangaProgress(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user?.id;
    const seriesId = parseInt(req.params.id, 10);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (isNaN(seriesId)) {
      return res.status(400).json({ error: 'Invalid series ID' });
    }

    const progress = await userProgressService.getProgress(userId, seriesId);

    return res.json({
      status: 200,
      seriesId,
      progress,
    });
  } catch (error) {
    logger.error(`Failed to get manga progress: ${error}`, { service: 'analyticsController' });
    return next(error);
  }
}

/**
 * Get per-chapter reading progress for a specific manga series
 */
export async function getSeriesChapterProgress(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user?.id;
    const seriesId = parseInt(req.params.id, 10);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (isNaN(seriesId)) {
      return res.status(400).json({ error: 'Invalid series ID' });
    }

    const chapterProgress = await userProgressService.getSeriesChapterProgress(userId, seriesId);

    return res.json({
      status: 200,
      seriesId,
      chapters: chapterProgress,
    });
  } catch (error) {
    logger.error(`Failed to get series chapter progress: ${error}`, { service: 'analyticsController' });
    return next(error);
  }
}

/**
 * Update reading progress for a manga chapter
 */
export async function updateProgress(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { seriesId, chapterId, pageNumber, totalPagesInChapter } = req.body;

    if (!seriesId || !chapterId || pageNumber === undefined || !totalPagesInChapter) {
      return res.status(400).json({ 
        error: 'Missing required fields: seriesId, chapterId, pageNumber, totalPagesInChapter' 
      });
    }

    await userProgressService.updateProgress({
      userId,
      seriesId: Number(seriesId),
      chapterId: Number(chapterId),
      pageNumber: Number(pageNumber),
      totalPagesInChapter: Number(totalPagesInChapter),
    });

    return res.json({
      status: 200,
      message: 'Progress updated successfully',
    });
  } catch (error) {
    logger.error(`Failed to update progress: ${error}`, { service: 'analyticsController' });
    return next(error);
  }
}

/**
 * Mark a chapter as fully read
 */
export async function markChapterAsRead(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user?.id;
    const { seriesId, chapterId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!seriesId || !chapterId) {
      return res.status(400).json({ 
        error: 'Missing required fields: seriesId, chapterId' 
      });
    }

    await userProgressService.markChapterAsRead(
      userId,
      Number(seriesId),
      Number(chapterId)
    );

    return res.json({
      status: 200,
      message: 'Chapter marked as read',
    });
  } catch (error) {
    logger.error(`Failed to mark chapter as read: ${error}`, { service: 'analyticsController' });
    return next(error);
  }
}

/**
 * Mark a chapter as unread
 */
export async function markChapterAsUnread(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user?.id;
    const { chapterId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!chapterId) {
      return res.status(400).json({ 
        error: 'Missing required field: chapterId' 
      });
    }

    await userProgressService.markChapterAsUnread(
      userId,
      Number(chapterId)
    );

    return res.json({
      status: 200,
      message: 'Chapter marked as unread',
    });
  } catch (error) {
    logger.error(`Failed to mark chapter as unread: ${error}`, { service: 'analyticsController' });
    return next(error);
  }
}

/**
 * Delete reading progress for a manga
 */
export async function deleteProgress(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user?.id;
    const seriesId = parseInt(req.params.id, 10);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (isNaN(seriesId)) {
      return res.status(400).json({ error: 'Invalid series ID' });
    }

    await userProgressService.deleteProgress(userId, seriesId);

    return res.json({
      status: 200,
      message: 'Progress deleted successfully',
    });
  } catch (error) {
    logger.error(`Failed to delete progress: ${error}`, { service: 'analyticsController' });
    return next(error);
  }
}

/**
 * Get user reading statistics
 */
export async function getMyStats(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const stats = await userProgressService.getUserStats(userId);

    return res.json({
      status: 200,
      stats,
    });
  } catch (error) {
    logger.error(`Failed to get user stats: ${error}`, { service: 'analyticsController' });
    return next(error);
  }
}
