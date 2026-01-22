import { db, schema } from '@/db/index';
import { eq, and, sql, asc } from 'drizzle-orm';
import logger from '@/services/loggerService';
import { cacheService } from '@/services/cacheService';

// Cache constants
const CACHE_TTL = {
  USER_PROGRESS: 300, // 5 minutes - frequently accessed
  USER_STATS: 1800, // 30 minutes - slower changing
};

const CACHE_KEYS = {
  USER_PROGRESS: (userId: string, limit: number) => `user:${userId}:progress:${limit}`,
  MANGA_PROGRESS: (userId: string, seriesId: number) => `user:${userId}:series:${seriesId}:progress`,
  USER_STATS: (userId: string) => `user:${userId}:stats`,
};

interface ProgressUpdate {
  userId: string;
  seriesId: number;
  chapterId: number;
  pageNumber: number;
  totalPagesInChapter: number;
}

class UserProgressService {
  /**
   * Update user's reading progress for a manga series
   * @param progressData - Progress tracking data
   */
  async updateProgress(progressData: ProgressUpdate): Promise<void> {
    try {
      const { userId, seriesId, chapterId, pageNumber, totalPagesInChapter } = progressData;

      const totalPages = Math.max(totalPagesInChapter || 0, 1);
      const clampedPage = Math.max(0, Math.min(pageNumber, totalPages));
      // Consider chapter complete when the user reaches the second-to-last page (or last page for very short chapters)
      const completionThreshold = totalPages <= 2 ? totalPages : totalPages - 1;

      // Get total chapters and pages for the series to calculate percentage
      const seriesData = await db.query.series.findFirst({
        where: (series, { eq }) => eq(series.id, seriesId),
        with: {
          chapters: {
            columns: {
              id: true,
              chapterNumber: true,
            },
              orderBy: (chapters, { asc }) => [asc(chapters.chapterNumber)],
          },
        },
      });

      if (!seriesData) {
        logger.warn(`Series not found: ${seriesId}`, { service: 'userProgressService' });
        return;
      }

      const totalChapters = seriesData.chapters.length;
      
      // Find the current chapter's index
        const currentChapterIndex = seriesData.chapters.findIndex(c => c.id === chapterId); // chapters are sorted by chapterNumber

      if (currentChapterIndex === -1) {
        logger.warn(`Chapter not found in series: seriesId=${seriesId}, chapterId=${chapterId}`, {
          service: 'userProgressService',
        });
        return;
      }
      
      // Check if user has reached the end of the chapter
      const isChapterComplete = clampedPage >= completionThreshold;
      
      // Calculate percentage: (completed chapters + current page progress) / total chapters
      let percentageCompleted = 0;
      if (totalChapters > 0) {
        // If chapter is complete, count it as a full chapter, otherwise partial
        const completedChapters = isChapterComplete ? currentChapterIndex + 1 : currentChapterIndex;
        const currentChapterProgress = isChapterComplete ? 0 : (clampedPage / totalPages);
        percentageCompleted = ((completedChapters + currentChapterProgress) / totalChapters) * 100;
        percentageCompleted = Math.min(Math.max(percentageCompleted, 0), 100); // Clamp between 0-100
      }
      
      // Log chapter completion
      if (isChapterComplete) {
        logger.info(`Chapter completed: userId=${userId}, seriesId=${seriesId}, chapterId=${chapterId}`, {
          service: 'userProgressService',
        });
      }

      // Upsert per-chapter progress
      await db
        .insert(schema.userChapterProgress)
        .values({
          userId,
          chapterId,
          lastPageNumber: clampedPage,
          isRead: isChapterComplete,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.userChapterProgress.userId, schema.userChapterProgress.chapterId],
          set: {
            lastPageNumber: sql`GREATEST(${schema.userChapterProgress.lastPageNumber}, ${clampedPage})`,
            isRead: isChapterComplete ? true : sql`${schema.userChapterProgress.isRead}`,
            updatedAt: new Date(),
          },
        });

      // Insert or update the progress record
      await db
        .insert(schema.userReadingProgress)
        .values({
          userId,
          seriesId,
          lastChapterId: chapterId,
          lastPageNumber: clampedPage,
          totalPagesRead: sql`${clampedPage}`, // This will be updated on conflict
          percentageCompleted,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.userReadingProgress.userId, schema.userReadingProgress.seriesId],
          set: {
            lastChapterId: chapterId,
            lastPageNumber: clampedPage,
            totalPagesRead: sql`${schema.userReadingProgress.totalPagesRead} + 1`,
            percentageCompleted,
            updatedAt: new Date(),
          },
        });

      logger.info(`Progress updated: userId=${userId}, seriesId=${seriesId}, chapter=${chapterId}, page=${clampedPage}, completion=${percentageCompleted.toFixed(2)}%`, {
        service: 'userProgressService',
      });

      // Invalidate cache - user progress changed
      await cacheService.invalidatePattern(`user:${userId}:progress:*`);
      await cacheService.invalidateTag('user_progress');
    } catch (error) {
      logger.error(`Failed to update progress: ${error}`, { service: 'userProgressService' });
      // Don't throw - we don't want tracking failures to break the user experience
    }
  }

  /**
   * Get user's reading progress for a specific manga
   * @param userId - The user ID
   * @param seriesId - The manga series ID
   */
  async getProgress(userId: string, seriesId: number) {
    try {
      const progress = await db.query.userReadingProgress.findFirst({
        where: (progress, { and, eq }) =>
          and(eq(progress.userId, userId), eq(progress.seriesId, seriesId)),
      });

      return progress || null;
    } catch (error) {
      logger.error(`Failed to get progress: ${error}`, { service: 'userProgressService' });
      throw error;
    }
  }

  /**
   * Get all reading progress for a user (Optimized with caching)
   * Used for "Continue Reading" feature
   * @param userId - The user ID
   * @param limit - Maximum number of results
   */
  async getUserProgress(userId: string, limit: number = 20) {
    try {
      const cacheKey = CACHE_KEYS.USER_PROGRESS(userId, limit);

      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug(`User progress cache hit for userId=${userId}`, { service: 'userProgressService' });
        return cached;
      }

      const progressList = await db
        .select({
          userId: schema.userReadingProgress.userId,
          seriesId: schema.userReadingProgress.seriesId,
          lastChapterId: schema.userReadingProgress.lastChapterId,
          lastPageNumber: schema.userReadingProgress.lastPageNumber,
          percentageCompleted: schema.userReadingProgress.percentageCompleted,
          updatedAt: schema.userReadingProgress.updatedAt,
          seriesTitle: schema.series.title,
          seriesCover: schema.series.cover,
          chapterNumber: schema.chapters.chapterNumber,
          chapterTitle: schema.chapters.title,
        })
        .from(schema.userReadingProgress)
        .innerJoin(schema.series, eq(schema.userReadingProgress.seriesId, schema.series.id))
        .leftJoin(schema.chapters, eq(schema.userReadingProgress.lastChapterId, schema.chapters.id))
        .where(eq(schema.userReadingProgress.userId, userId))
        .orderBy(sql`${schema.userReadingProgress.updatedAt} DESC`)
        .limit(limit);

      // Cache the result
      await cacheService.set(cacheKey, progressList, CACHE_TTL.USER_PROGRESS, ['user_progress']);

      return progressList;
    } catch (error) {
      logger.error(`Failed to get user progress: ${error}`, { service: 'userProgressService' });
      throw error;
    }
  }

  /**
   * Delete user's progress for a specific manga
   * @param userId - The user ID
   * @param seriesId - The manga series ID
   */
  async deleteProgress(userId: string, seriesId: number): Promise<void> {
    try {
      await db
        .delete(schema.userReadingProgress)
        .where(
          and(
            eq(schema.userReadingProgress.userId, userId),
            eq(schema.userReadingProgress.seriesId, seriesId)
          )
        );

      logger.info(`Progress deleted: userId=${userId}, seriesId=${seriesId}`, {
        service: 'userProgressService',
      });

      // Invalidate cache - user progress changed
      await cacheService.invalidatePattern(`user:${userId}:progress:*`);
      await cacheService.invalidateTag('user_progress');
    } catch (error) {
      logger.error(`Failed to delete progress: ${error}`, { service: 'userProgressService' });
      throw error;
    }
  }

  /**
   * Mark a chapter as fully read
   * @param userId - The user ID
   * @param seriesId - The series ID
   * @param chapterId - The chapter ID to mark as read
   */
  async markChapterAsRead(userId: string, seriesId: number, chapterId: number): Promise<void> {
    try {
      // Get all chapters for this series to find the next chapter
      const allChapters = await db.query.chapters.findMany({
        where: (chapters, { eq }) => eq(chapters.seriesId, seriesId),
        orderBy: (chapters, { asc }) => [asc(chapters.chapterNumber)],
      });

      const currentChapterIndex = allChapters.findIndex(c => c.id === chapterId);
      
      if (currentChapterIndex === -1) {
        logger.warn(`Chapter not found: ${chapterId}`, { service: 'userProgressService' });
        return;
      }

      const currentChapter = allChapters[currentChapterIndex];

      const currentPageCount = Math.max(currentChapter.pageCount || 0, 1);

      // Persist chapter as read in per-chapter table
      await db
        .insert(schema.userChapterProgress)
        .values({
          userId,
          chapterId,
          lastPageNumber: currentPageCount,
          isRead: true,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.userChapterProgress.userId, schema.userChapterProgress.chapterId],
          set: {
            lastPageNumber: sql`GREATEST(${schema.userChapterProgress.lastPageNumber}, ${currentPageCount})`,
            isRead: true,
            updatedAt: new Date(),
          },
        });

      // Keep progress pointer at the end of the current chapter (no auto-advance)
      await this.updateProgress({
        userId,
        seriesId,
        chapterId,
        pageNumber: currentChapter.pageCount || 1,
        totalPagesInChapter: currentChapter.pageCount || 1,
      });

      logger.info(`Chapter marked as read: userId=${userId}, chapterId=${chapterId}`, {
        service: 'userProgressService',
      });
    } catch (error) {
      logger.error(`Failed to mark chapter as read: ${error}`, { service: 'userProgressService' });
      throw error;
    }
  }

  /**
   * Mark a chapter as unread (reset progress)
   * @param userId - The user ID
   * @param chapterId - The chapter ID to mark as unread
   */
  async markChapterAsUnread(userId: string, chapterId: number): Promise<void> {
    try {
      // Delete the per-chapter progress entry
      await db
        .delete(schema.userChapterProgress)
        .where(
          and(
            eq(schema.userChapterProgress.userId, userId),
            eq(schema.userChapterProgress.chapterId, chapterId)
          )
        );

      // Also reset series progress if the current pointer is on this chapter
      // to prevent fallback logic from showing it as read
      const chapterInfo = await db.query.chapters.findFirst({
        where: (chapters, { eq }) => eq(chapters.id, chapterId),
      });

      if (chapterInfo) {
        await db
          .update(schema.userReadingProgress)
          .set({
            lastChapterId: chapterId,
            lastPageNumber: 0,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.userReadingProgress.userId, userId),
              eq(schema.userReadingProgress.seriesId, chapterInfo.seriesId),
              eq(schema.userReadingProgress.lastChapterId, chapterId)
            )
          );
      }

      logger.info(`Chapter marked as unread: userId=${userId}, chapterId=${chapterId}`, {
        service: 'userProgressService',
      });

      // Invalidate cache
      await cacheService.invalidatePattern(`user:${userId}:progress:*`);
      await cacheService.invalidateTag('user_progress');
    } catch (error) {
      logger.error(`Failed to mark chapter as unread: ${error}`, { service: 'userProgressService' });
      throw error;
    }
  }

  /**
   * Get per-chapter progress data for a user in a specific series
   * Used to display progress bars for each chapter
   * @param userId - The user ID
   * @param seriesId - The series ID
   */
  async getSeriesChapterProgress(userId: string, seriesId: number) {
    try {
      // Get all chapters with their data for this series (sorted by chapter number for correct ordering)
      const allChapters = await db.query.chapters.findMany({
        where: (chapters, { eq }) => eq(chapters.seriesId, seriesId),
        orderBy: (chapters, { asc }) => [asc(chapters.chapterNumber)],
      });

      // Get per-chapter progress rows
      const perChapterProgress = await db.query.userChapterProgress.findMany({
        where: (progress, { eq }) => eq(progress.userId, userId),
      });

      // Get the user's overall series progress to know the current chapter pointer (for "reading" state)
      const seriesProgress = await db.query.userReadingProgress.findFirst({
        where: (progress, { and, eq }) =>
          and(eq(progress.userId, userId), eq(progress.seriesId, seriesId)),
      });

      if (!seriesProgress && perChapterProgress.length === 0) {
        // User hasn't started this series
        return [];
      }

      const progressByChapterId = new Map(perChapterProgress.map((p) => [p.chapterId, p]));
      const currentChapterId = seriesProgress?.lastChapterId;

      // Build response with progress for each chapter
      const chapterProgress = allChapters.map((chapter, index) => {
        const progress = progressByChapterId.get(chapter.id);
        const totalPages = Math.max(chapter.pageCount || 0, 1);

        let lastPageNumber = 0;
        let isRead = false;

        if (progress) {
          lastPageNumber = Math.min(Math.max(progress.lastPageNumber, 0), totalPages);
          isRead = progress.isRead || lastPageNumber >= totalPages;
        } else if (seriesProgress && seriesProgress.lastChapterId === chapter.id) {
          // Fallback to series pointer if no per-chapter row yet
          lastPageNumber = Math.min(Math.max(seriesProgress.lastPageNumber, 0), totalPages);
          isRead = lastPageNumber >= totalPages;
        }

        const percentageCompleted = Math.min(Math.max((lastPageNumber / totalPages) * 100, 0), 100);
        const isReading = !isRead && currentChapterId === chapter.id;

        return {
          chapterId: chapter.id,
          chapterNumber: chapter.chapterNumber,
          title: chapter.title,
          pageCount: chapter.pageCount,
          lastPageNumber,
          percentageCompleted,
          isRead,
          isReading,
        };
      });

      return chapterProgress;
    } catch (error) {
      logger.error(`Failed to get series chapter progress: ${error}`, { service: 'userProgressService' });
      return [];
    }
  }

  /**
   * Get reading statistics for a user (With caching)
   * @param userId - The user ID
   */
  async getUserStats(userId: string) {
    try {
      const cacheKey = CACHE_KEYS.USER_STATS(userId);

      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug(`User stats cache hit for userId=${userId}`, { service: 'userProgressService' });
        return cached;
      }

      const stats = await db
        .select({
          totalSeriesReading: sql<number>`COUNT(*)`.as('total_series_reading'),
          averageCompletion: sql<number>`AVG(${schema.userReadingProgress.percentageCompleted})`.as('average_completion'),
          totalPagesRead: sql<number>`SUM(${schema.userReadingProgress.totalPagesRead})`.as('total_pages_read'),
        })
        .from(schema.userReadingProgress)
        .where(eq(schema.userReadingProgress.userId, userId));

      const result = stats[0] || {
        totalSeriesReading: 0,
        averageCompletion: 0,
        totalPagesRead: 0,
      };

      // Cache the result
      await cacheService.set(cacheKey, result, CACHE_TTL.USER_STATS, ['user_progress']);

      return result;
    } catch (error) {
      logger.error(`Failed to get user stats: ${error}`, { service: 'userProgressService' });
      throw error;
    }
  }
}

export const userProgressService = new UserProgressService();
