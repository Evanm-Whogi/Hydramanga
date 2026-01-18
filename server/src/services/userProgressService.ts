import { db, schema } from '@/db/index';
import { eq, and, sql } from 'drizzle-orm';
import logger from '@/services/loggerService';

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

      // Get total chapters and pages for the series to calculate percentage
      const seriesData = await db.query.series.findFirst({
        where: (series, { eq }) => eq(series.id, seriesId),
        with: {
          chapters: {
            columns: {
              id: true,
              chapterNumber: true,
            },
          },
        },
      });

      if (!seriesData) {
        logger.warn(`Series not found: ${seriesId}`, { service: 'userProgressService' });
        return;
      }

      const totalChapters = seriesData.chapters.length;
      
      // Find the current chapter's index
      const currentChapterIndex = seriesData.chapters.findIndex(c => c.id === chapterId);
      
      // Calculate percentage: (completed chapters + current page progress) / total chapters
      let percentageCompleted = 0;
      if (totalChapters > 0) {
        const completedChapters = currentChapterIndex; // Chapters before current one
        const currentChapterProgress = pageNumber / Math.max(totalPagesInChapter, 1);
        percentageCompleted = ((completedChapters + currentChapterProgress) / totalChapters) * 100;
        percentageCompleted = Math.min(Math.max(percentageCompleted, 0), 100); // Clamp between 0-100
      }

      // Insert or update the progress record
      await db
        .insert(schema.userReadingProgress)
        .values({
          userId,
          seriesId,
          lastChapterId: chapterId,
          lastPageNumber: pageNumber,
          totalPagesRead: sql`${pageNumber}`, // This will be updated on conflict
          percentageCompleted,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.userReadingProgress.userId, schema.userReadingProgress.seriesId],
          set: {
            lastChapterId: chapterId,
            lastPageNumber: pageNumber,
            totalPagesRead: sql`${schema.userReadingProgress.totalPagesRead} + 1`,
            percentageCompleted,
            updatedAt: new Date(),
          },
        });

      logger.info(`Progress updated: userId=${userId}, seriesId=${seriesId}, chapter=${chapterId}, page=${pageNumber}, completion=${percentageCompleted.toFixed(2)}%`, {
        service: 'userProgressService',
      });
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
   * Get all reading progress for a user (for continue reading feature)
   * @param userId - The user ID
   * @param limit - Maximum number of results
   */
  async getUserProgress(userId: string, limit: number = 20) {
    try {
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
    } catch (error) {
      logger.error(`Failed to delete progress: ${error}`, { service: 'userProgressService' });
      throw error;
    }
  }

  /**
   * Get reading statistics for a user
   * @param userId - The user ID
   */
  async getUserStats(userId: string) {
    try {
      const stats = await db
        .select({
          totalSeriesReading: sql<number>`COUNT(*)`.as('total_series_reading'),
          averageCompletion: sql<number>`AVG(${schema.userReadingProgress.percentageCompleted})`.as('average_completion'),
          totalPagesRead: sql<number>`SUM(${schema.userReadingProgress.totalPagesRead})`.as('total_pages_read'),
        })
        .from(schema.userReadingProgress)
        .where(eq(schema.userReadingProgress.userId, userId));

      return stats[0] || {
        totalSeriesReading: 0,
        averageCompletion: 0,
        totalPagesRead: 0,
      };
    } catch (error) {
      logger.error(`Failed to get user stats: ${error}`, { service: 'userProgressService' });
      throw error;
    }
  }
}

export const userProgressService = new UserProgressService();
