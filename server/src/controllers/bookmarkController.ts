import { Request, Response, NextFunction } from 'express';
import { BookmarkService } from '@/services/bookmarkService';
import logger from '@/services/loggerService';

/**
 * Add or update a bookmark with optional note
 * POST /manga/:id/chapter/:chapterId/bookmark
 */
export async function addBookmark(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const { chapterId } = req.params;
    const { note } = req.body;

    if (!chapterId) {
      res.status(400).json({ error: 'Chapter ID is required' });
      return;
    }

    const parsedChapterId = parseInt(chapterId, 10);
    if (isNaN(parsedChapterId)) {
      res.status(400).json({ error: 'Invalid chapter ID' });
      return;
    }

    const bookmark = await BookmarkService.addBookmark(
      userId,
      parsedChapterId,
      note
    );

    res.status(200).json({
      success: true,
      bookmark,
    });
  } catch (error) {
    logger.error(`Failed to add bookmark: ${error}`, {
      service: 'bookmarkController',
    });
    res.status(500).json({ error: 'Failed to add bookmark' });
  }
}

/**
 * Remove a bookmark
 * DELETE /manga/:id/chapter/:chapterId/bookmark
 */
export async function removeBookmark(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const { chapterId } = req.params;

    if (!chapterId) {
      res.status(400).json({ error: 'Chapter ID is required' });
      return;
    }

    const parsedChapterId = parseInt(chapterId, 10);
    if (isNaN(parsedChapterId)) {
      res.status(400).json({ error: 'Invalid chapter ID' });
      return;
    }

    await BookmarkService.removeBookmark(userId, parsedChapterId);

    res.status(200).json({
      success: true,
      message: 'Bookmark removed',
    });
  } catch (error) {
    logger.error(`Failed to remove bookmark: ${error}`, {
      service: 'bookmarkController',
    });
    res.status(500).json({ error: 'Failed to remove bookmark' });
  }
}

/**
 * Get all bookmarks for a series
 * GET /manga/:id/bookmarks
 */
export async function getSeriesBookmarks(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ error: 'Series ID is required' });
      return;
    }

    const seriesId = parseInt(id, 10);
    if (isNaN(seriesId)) {
      res.status(400).json({ error: 'Invalid series ID' });
      return;
    }

    const bookmarksList = await BookmarkService.getSeriesBookmarks(
      userId,
      seriesId
    );

    res.status(200).json({
      bookmarks: bookmarksList,
      count: bookmarksList.length,
    });
  } catch (error) {
    logger.error(`Failed to get series bookmarks: ${error}`, {
      service: 'bookmarkController',
    });
    res.status(500).json({ error: 'Failed to get bookmarks' });
  }
}

/**
 * Get bookmark details for a chapter
 * GET /manga/:id/chapter/:chapterId/bookmark
 */
export async function getBookmark(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const { chapterId } = req.params;

    if (!chapterId) {
      res.status(400).json({ error: 'Chapter ID is required' });
      return;
    }

    const parsedChapterId = parseInt(chapterId, 10);
    if (isNaN(parsedChapterId)) {
      res.status(400).json({ error: 'Invalid chapter ID' });
      return;
    }

    const bookmark = await BookmarkService.getBookmark(
      userId,
      parsedChapterId
    );

    res.status(200).json({
      bookmark: bookmark || null,
      isBookmarked: !!bookmark,
    });
  } catch (error) {
    logger.error(`Failed to get bookmark: ${error}`, {
      service: 'bookmarkController',
    });
    res.status(500).json({ error: 'Failed to get bookmark' });
  }
}
