import { db } from '@/db';
import { bookmarks, chapters } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import logger from '@/services/loggerService';

export class BookmarkService {
  /**
   * Create or update a bookmark with optional note
   */
  static async addBookmark(
    userId: string,
    chapterId: number,
    note?: string
  ): Promise<any> {
    try {
      const result = await db
        .insert(bookmarks)
        .values({
          userId,
          chapterId,
          note: note || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [bookmarks.userId, bookmarks.chapterId],
          set: {
            note: note || null,
            updatedAt: new Date(),
          },
        })
        .returning();

      logger.info(
        `Bookmark added/updated for user ${userId} on chapter ${chapterId}`,
        { service: 'bookmarkService' }
      );

      return result[0] || null;
    } catch (error) {
      logger.error(`Failed to add bookmark: ${error}`, {
        service: 'bookmarkService',
      });
      throw error;
    }
  }

  /**
   * Remove a bookmark
   */
  static async removeBookmark(userId: string, chapterId: number): Promise<void> {
    try {
      await db
        .delete(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.chapterId, chapterId)
          )
        );

      logger.info(
        `Bookmark removed for user ${userId} on chapter ${chapterId}`,
        { service: 'bookmarkService' }
      );
    } catch (error) {
      logger.error(`Failed to remove bookmark: ${error}`, {
        service: 'bookmarkService',
      });
      throw error;
    }
  }

  /**
   * Get all bookmarks for a user in a specific series
   */
  static async getSeriesBookmarks(
    userId: string,
    seriesId: number
  ): Promise<any[]> {
    try {
      const result = await db
        .select({
          chapterId: bookmarks.chapterId,
          note: bookmarks.note,
          createdAt: bookmarks.createdAt,
          updatedAt: bookmarks.updatedAt,
        })
        .from(bookmarks)
        .innerJoin(chapters, eq(bookmarks.chapterId, chapters.id))
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(chapters.seriesId, seriesId)
          )
        )
        .orderBy(bookmarks.createdAt);

      return result;
    } catch (error) {
      logger.error(`Failed to get series bookmarks: ${error}`, {
        service: 'bookmarkService',
      });
      throw error;
    }
  }

  /**
   * Get all bookmarks for a user across all series
   */
  static async getUserBookmarks(userId: string): Promise<any[]> {
    try {
      const result = await db
        .select({
          chapterId: bookmarks.chapterId,
          note: bookmarks.note,
          createdAt: bookmarks.createdAt,
          updatedAt: bookmarks.updatedAt,
          chapterNumber: chapters.chapterNumber,
          seriesId: chapters.seriesId,
        })
        .from(bookmarks)
        .innerJoin(chapters, eq(bookmarks.chapterId, chapters.id))
        .where(eq(bookmarks.userId, userId))
        .orderBy(bookmarks.createdAt);

      return result;
    } catch (error) {
      logger.error(`Failed to get user bookmarks: ${error}`, {
        service: 'bookmarkService',
      });
      throw error;
    }
  }

  /**
   * Check if a chapter is bookmarked by a user
   */
  static async isBookmarked(userId: string, chapterId: number): Promise<boolean> {
    try {
      const result = await db
        .select({ chapterId: bookmarks.chapterId })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.chapterId, chapterId)
          )
        )
        .limit(1);

      return result.length > 0;
    } catch (error) {
      logger.error(`Failed to check bookmark status: ${error}`, {
        service: 'bookmarkService',
      });
      throw error;
    }
  }

  /**
   * Get bookmark details for a specific chapter
   */
  static async getBookmark(
    userId: string,
    chapterId: number
  ): Promise<any | null> {
    try {
      const result = await db
        .select()
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.chapterId, chapterId)
          )
        )
        .limit(1);

      return result[0] || null;
    } catch (error) {
      logger.error(`Failed to get bookmark: ${error}`, {
        service: 'bookmarkService',
      });
      throw error;
    }
  }
}
