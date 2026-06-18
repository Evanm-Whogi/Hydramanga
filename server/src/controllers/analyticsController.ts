import { Request, Response, NextFunction } from 'express';
import { metricsService } from '@/services/metricsService';
import { userProgressService } from '@/services/userProgressService';
import { getUserSettings, incrementIncognitoChaptersRead } from '@/services/userSettingsService';
import { badgeService } from '@/services/badgeService';
import logger from '@/services/loggerService';
import { db, schema } from '@/db/index';
import { eq, avg, count } from 'drizzle-orm';

async function isIncognitoEnabled(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const settings = await getUserSettings(userId);
  return settings.incognitoMode === true;
}

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
      '2weeks': 14,
      'month': 30,
      'quarter': 90,
      'year': 365,
    };

    const days = periodToDays[String(period)] || 7;
    const maxLimit = Math.min(Number(limit), 100);
    const { hideNsfw } = await getUserSettings(req.user?.id);

    const trending = await metricsService.getTrendingManga(days, maxLimit, hideNsfw);
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

    const [mangaStats, chapterStats, ratingResult, reviewCount] = await Promise.all([
      metricsService.getMangaStats(seriesId),
      metricsService.getSeriesChapterStats(seriesId),
      db.select({ avg: avg(schema.reviews.rating) })
        .from(schema.reviews)
        .where(eq(schema.reviews.seriesId, seriesId))
        .then((rows) => {
          const raw = rows[0]?.avg;
          return raw != null ? Math.round(parseFloat(raw as string) * 10) / 10 : null;
        }),
      db.select({ count: count() })
        .from(schema.reviews)
        .where(eq(schema.reviews.seriesId, seriesId))
        .then((rows) => rows[0]?.count || 0),
    ]);

    // Disable browser caching for analytics - ensure fresh data
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    return res.json({
      status: 200,
      seriesId,
      stats: {
        manga: { ...mangaStats, reviewRating: ratingResult, reviewCount: reviewCount },
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

    const { limit = '20' } = req.query;
    const maxLimit = Math.min(Number(limit), 100);

    const { hideNsfw } = await getUserSettings(userId);
    const progress = await userProgressService.getUserProgress(userId, maxLimit, hideNsfw);
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
    const { seriesId, chapterId, pageNumber, totalPagesInChapter } = req.body;

    if (!seriesId || !chapterId || pageNumber === undefined || !totalPagesInChapter) {
      return res.status(400).json({ 
        error: 'Missing required fields: seriesId, chapterId, pageNumber, totalPagesInChapter' 
      });
    }

    if (await isIncognitoEnabled(userId)) {
      return res.json({
        status: 200,
        message: 'Incognito mode enabled; progress not persisted',
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

    if (!seriesId || !chapterId) {
      return res.status(400).json({ 
        error: 'Missing required fields: seriesId, chapterId' 
      });
    }

    if (await isIncognitoEnabled(userId)) {
      await incrementIncognitoChaptersRead(userId);
      badgeService.evaluateBadgesAsync(userId, 'chapter_read');
      return res.json({
        status: 200,
        message: 'Incognito mode enabled; progress not persisted',
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

    if (!chapterId) {
      return res.status(400).json({ 
        error: 'Missing required field: chapterId' 
      });
    }

    if (await isIncognitoEnabled(userId)) {
      return res.json({
        status: 200,
        message: 'Incognito mode enabled; progress not persisted',
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
 * Delete user's reading progress for a specific manga
 * @route DELETE /analytics/progress/manga/:id
 */
export async function deleteProgress(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user?.id;
    const seriesId = parseInt(req.params.id, 10);

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
 * Returns overall stats and per-manga reading time breakdown
 * @route GET /analytics/stats
 */
export async function getMyStats(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized: User ID not found',
      });
    }

    const stats = await userProgressService.getUserStats(userId);

    return res.json({
      status: 200,
      stats,
    });
  } catch (error) {
    logger.error(
      `Failed to get user stats: ${error}`,
      { service: 'analyticsController' }
    );
    return next(error);
  }
}

/**
 * Record reading time for a chapter
 * Accumulates total seconds spent reading each chapter
 * @route POST /analytics/progress/time
 * @body seriesId - Manga series ID
 * @body chapterId - Chapter ID
 * @body seconds - Seconds spent reading (must be > 0)
 */
export async function recordReadingTime(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  try {
    const userId = req.user?.id;
    const { seriesId, chapterId, seconds } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized: User ID not found',
      });
    }

    // Validate required fields
    if (!seriesId || !chapterId || typeof seconds !== 'number' || seconds <= 0) {
      return res.status(400).json({
        error:
          'Invalid request body: seriesId (number), chapterId (number), and seconds (positive number) are required',
      });
    }

    if (await isIncognitoEnabled(userId)) {
      return res.json({
        status: 200,
        message: 'Incognito mode enabled; reading time not persisted',
      });
    }

    // Record reading time in database
    await userProgressService.recordReadingTime({
      userId,
      seriesId: Number(seriesId),
      chapterId: Number(chapterId),
      seconds: Number(seconds),
    });

    return res.json({
      status: 200,
      message: 'Reading time recorded successfully',
    });
  } catch (error) {
    logger.error(
      `Failed to record reading time: ${error}`,
      { service: 'analyticsController' }
    );
    return next(error);
  }
}
/**
 * Clear all reading progress history for the authenticated user
 * @route DELETE /analytics/progress/all
 */
export async function clearAllProgress(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized: User ID not found',
      });
    }

    await userProgressService.clearAllUserProgress(userId);

    return res.json({
      status: 200,
      message: 'All reading progress cleared successfully',
    });
  } catch (error) {
    logger.error(
      `Failed to clear all progress: ${error}`,
      { service: 'analyticsController' }
    );
    return next(error);
  }
}

/**
 * Get user's manga view history (most recent view per manga)
 * @route GET /analytics/views
 */
export async function getMyViewHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized: User ID not found',
      });
    }

    const { limit = '50' } = req.query;
    const maxLimit = Math.min(Number(limit), 100);

    const viewHistory = await metricsService.getUserViewHistory(userId, maxLimit);

    return res.json({
      status: 200,
      count: viewHistory.length,
      views: viewHistory,
    });
  } catch (error) {
    logger.error(
      `Failed to get user view history: ${error}`,
      { service: 'analyticsController' }
    );
    return next(error);
  }
}

/**
 * Delete a manga from user's view history
 * @route DELETE /analytics/views/:id
 */
export async function deleteViewHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  try {
    const userId = req.user?.id;
    const seriesId = parseInt(req.params.id, 10);

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized: User ID not found',
      });
    }

    if (isNaN(seriesId)) {
      return res.status(400).json({ error: 'Invalid series ID' });
    }

    await metricsService.deleteViewHistory(userId, seriesId);

    return res.json({
      status: 200,
      message: 'View history deleted successfully',
    });
  } catch (error) {
    logger.error(
      `Failed to delete view history: ${error}`,
      { service: 'analyticsController' }
    );
    return next(error);
  }
}

export async function clearAllViewHistory(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized: User ID not found" });
    
    await metricsService.clearAllViewHistory(userId);

    return res.json({ status: 200, message: "All view history cleared successfully" });
  } catch (error) {
    logger.error(`Failed to clear all view history: ${error}`, { service: "analyticsController" });
    return next(error);
  }
}