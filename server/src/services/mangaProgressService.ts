import { db } from '@/db';
import { mangaImportProgress } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { queueService } from '@/services/queueService';
import { getIOInstance } from '@/sockets/socketManager';
import logger from '@/services/loggerService';

const PROGRESS_CHANNEL_PREFIX = 'manga:progress:';
const PROGRESS_TTL = 3600; // 1 hour in seconds

export type ProgressStatus = 'scanning' | 'downloading' | 'completed' | 'failed';

export interface MangaProgress {
  seriesId: number;
  totalChapters: number;
  downloadedChapters: number;
  status: ProgressStatus;
  percentage: number;
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
  errorMessage?: string | null;
  scraperId?: string | null;
  scraperUrl?: string | null;
  lastDownloadedChapter?: {
    id?: number;
    chapterNumber: string;
    title: string;
    pageCount: number;
    createdAt?: string;
    updatedAt?: string;
  } | null;
}

/**
 * State machine for manga progress validation
 * Ensures only valid state transitions occur
 */
class ProgressStateMachine {
  private static readonly VALID_TRANSITIONS: Record<ProgressStatus, ProgressStatus[]> = {
    'scanning': ['downloading', 'failed', 'completed'], // completed if 0 chapters found
    'downloading': ['completed', 'failed'],
    'completed': [], // terminal state
    'failed': ['scanning'], // can retry after failure
  };

  static canTransition(fromState: ProgressStatus, toState: ProgressStatus): boolean {
    const validTransitions = this.VALID_TRANSITIONS[fromState] || [];
    return validTransitions.includes(toState);
  }

  static assertTransition(fromState: ProgressStatus, toState: ProgressStatus): void {
    if (!this.canTransition(fromState, toState)) {
      throw new Error(
        `Invalid state transition: ${fromState} -> ${toState}. Valid transitions from ${fromState}: ${this.VALID_TRANSITIONS[fromState].join(', ')}`
      );
    }
  }

  static getValidTransitions(state: ProgressStatus): ProgressStatus[] {
    return this.VALID_TRANSITIONS[state] || [];
  }
}

class MangaProgressService {
  private redis: any;

  constructor() {
    // Lazily resolve Redis client to avoid circular import initialization issues
    this.redis = null;
  }

  private getRedis() {
    if (!this.redis) {
      this.redis = queueService.getRedisClient();
    }
    return this.redis;
  }

  // Initialize progress tracking for a new manga import
  async initializeProgress(seriesId: number): Promise<void> {
    try {
      // Insert or reset progress in database
      await db.insert(mangaImportProgress)
        .values({
          seriesId,
          totalChapters: 0,
          downloadedChapters: 0,
          status: 'scanning',
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: mangaImportProgress.seriesId,
          set: {
            totalChapters: 0,
            downloadedChapters: 0,
            status: 'scanning',
            startedAt: new Date(),
            updatedAt: new Date(),
            completedAt: null,
            errorMessage: null,
          },
        });

      // Store in Redis for real-time access
      const progressData: MangaProgress = {
        seriesId,
        totalChapters: 0,
        downloadedChapters: 0,
        status: 'scanning',
        percentage: 0,
        startedAt: new Date(),
        updatedAt: new Date(),
      };

      await this.getRedis().setex(
        `${PROGRESS_CHANNEL_PREFIX}${seriesId}`,
        PROGRESS_TTL,
        JSON.stringify(progressData)
      );

      // Publish initial state
      await this.publishProgress(seriesId, progressData);

      logger.info(`Progress initialized for series ${seriesId}`, { service: 'mangaProgressService' });
    } catch (error) {
      logger.error(`Failed to initialize progress for series ${seriesId}: ${error}`, { service: 'mangaProgressService' });
      throw error;
    }
  }

  // Update total chapters found during scanning
  async setTotalChapters(seriesId: number, totalChapters: number, scraperId?: string | null): Promise<void> {
    try {
      const progress = await this.getProgress(seriesId);
      if (!progress) {
        logger.warn(`No progress found for series ${seriesId}, initializing...`, { service: 'mangaProgressService' });
        await this.initializeProgress(seriesId);
        return;
      }

      // If no chapters found, mark as completed immediately
      if (totalChapters === 0) {
        const newStatus: ProgressStatus = 'completed';
        ProgressStateMachine.assertTransition(progress.status, newStatus);

        logger.debug(`No new chapters found for series ${seriesId}, transitioning from ${progress.status} to ${newStatus}`, { service: 'mangaProgressService' });

        // Update database
        await db.update(mangaImportProgress)
          .set({
            totalChapters: 0,
            downloadedChapters: 0,
            status: newStatus,
            scraperId: scraperId || null,
            updatedAt: new Date(),
            completedAt: new Date(),
          })
          .where(eq(mangaImportProgress.seriesId, seriesId));

        logger.debug(`Database updated for series ${seriesId}: status=${newStatus}, totalChapters=0`, { service: 'mangaProgressService' });

        // Update Redis
        const updatedProgress: MangaProgress = {
          ...progress,
          totalChapters: 0,
          downloadedChapters: 0,
          status: newStatus,
          percentage: 100,
          updatedAt: new Date(),
          completedAt: new Date(),
        };

        await this.getRedis().setex(
          `${PROGRESS_CHANNEL_PREFIX}${seriesId}`,
          PROGRESS_TTL,
          JSON.stringify(updatedProgress)
        );

        logger.debug(`Redis updated for series ${seriesId}: published completion status`, { service: 'mangaProgressService' });

        // Publish update to all listeners
        await this.publishProgress(seriesId, updatedProgress);

        logger.info(`No new chapters found for series ${seriesId}, marked as completed`, { service: 'mangaProgressService' });
        
        // Auto-cleanup after 5 minutes
        setTimeout(() => this.cleanupProgress(seriesId), 5 * 60 * 1000);
        return;
      }

      // Validate state transition
      const newStatus: ProgressStatus = 'downloading';
      ProgressStateMachine.assertTransition(progress.status, newStatus);

      // Update database
      await db.update(mangaImportProgress)
        .set({
          totalChapters,
          status: newStatus,
          scraperId: scraperId || null,
          updatedAt: new Date(),
        })
        .where(eq(mangaImportProgress.seriesId, seriesId));

      // Update Redis
      const updatedProgress: MangaProgress = {
        ...progress,
        totalChapters,
        status: newStatus,
        percentage: 0,
        updatedAt: new Date(),
      };

      await this.getRedis().setex(
        `${PROGRESS_CHANNEL_PREFIX}${seriesId}`,
        PROGRESS_TTL,
        JSON.stringify(updatedProgress)
      );

      // Publish update
      await this.publishProgress(seriesId, updatedProgress);

      logger.info(`Total chapters set to ${totalChapters} for series ${seriesId}`, { service: 'mangaProgressService' });
    } catch (error) {
      logger.error(`Failed to set total chapters for series ${seriesId}: ${error}`, { service: 'mangaProgressService' });
      throw error;
    }
  }

  // Increment downloaded chapters count
  async incrementDownloaded(seriesId: number, chapterInfo?: { id?: number; chapterNumber: string; title: string; pageCount: number; createdAt?: string; updatedAt?: string }): Promise<void> {
    try {
      const progress = await this.getProgress(seriesId);
      if (!progress) {
        logger.warn(`No progress found for series ${seriesId} when incrementing`, { service: 'mangaProgressService' });
        return;
      }

      // Validate state transition - should be in downloading state
      if (progress.status !== 'downloading') {
        logger.warn(
          `Cannot increment progress for series ${seriesId}: current status is ${progress.status}, expected 'downloading'`,
          { service: 'mangaProgressService' }
        );
        return;
      }

      // Use atomic increment to prevent race conditions when multiple chapters complete simultaneously
      // This updates the database first, then fetches the new value
      await db.update(mangaImportProgress)
        .set({
          downloadedChapters: sql`downloaded_chapters + 1`,
          updatedAt: new Date(),
        })
        .where(eq(mangaImportProgress.seriesId, seriesId));

      // Fetch updated progress to get the actual count after atomic increment
      const [updatedRecord] = await db
        .select()
        .from(mangaImportProgress)
        .where(eq(mangaImportProgress.seriesId, seriesId))
        .limit(1);

      if (!updatedRecord) {
        logger.error(`Failed to fetch updated progress for series ${seriesId}`, { service: 'mangaProgressService' });
        return;
      }

      const newDownloaded = updatedRecord.downloadedChapters;
      
      // Check if completed
      const isCompleted = newDownloaded >= progress.totalChapters && progress.totalChapters > 0;
      
      // Calculate percentage - cap at 99% until actually completed to avoid false 100%
      let percentage = progress.totalChapters > 0
        ? Math.round((newDownloaded / progress.totalChapters) * 100)
        : 0;
      
      // Don't show 100% unless actually completed
      if (percentage === 100 && !isCompleted) {
        percentage = 99;
      }
      
      const newStatus: ProgressStatus = isCompleted ? 'completed' : 'downloading';

      // Update status if completed
      if (isCompleted) {
        await db.update(mangaImportProgress)
          .set({
            status: newStatus,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(mangaImportProgress.seriesId, seriesId));
      }

      // Update Redis with chapter info
      const updatedProgress: MangaProgress = {
        ...progress,
        downloadedChapters: newDownloaded,
        status: newStatus,
        percentage,
        updatedAt: new Date(),
        lastDownloadedChapter: chapterInfo || null,
        ...(isCompleted && { completedAt: new Date() }),
      };

      await this.getRedis().setex(
        `${PROGRESS_CHANNEL_PREFIX}${seriesId}`,
        PROGRESS_TTL,
        JSON.stringify(updatedProgress)
      );

      // Publish update (includes chapter info for SSE clients)
      await this.publishProgress(seriesId, updatedProgress);

      logger.info(
        `Progress updated for series ${seriesId}: ${newDownloaded}/${progress.totalChapters} (${percentage}%)${chapterInfo ? ` - Chapter ${chapterInfo.chapterNumber}` : ''}`,
        { service: 'mangaProgressService' }
      );

      // Auto-cleanup completed progress after 5 minutes
      if (isCompleted) {
        setTimeout(() => this.cleanupProgress(seriesId), 5 * 60 * 1000);
      }
    } catch (error) {
      logger.error(`Failed to increment downloaded for series ${seriesId}: ${error}`, { service: 'mangaProgressService' });
    }
  }

  // Mark import as failed
  async markFailed(seriesId: number, errorMessage: string): Promise<void> {
    try {
      const progress = await this.getProgress(seriesId);
      if (!progress) {
        logger.warn(`No progress found for series ${seriesId} when marking as failed`, { service: 'mangaProgressService' });
        return;
      }

      // If already failed, update error message only to avoid state transition errors
      // Multiple chapters may fail and call this method - we only care about first failure
      if (progress.status === 'failed') {
        logger.debug(
          `Series ${seriesId} already in failed state, appending error message`,
          { service: 'mangaProgressService' }
        );
        
        // Update error message if new one is provided
        if (errorMessage && errorMessage.length > 0) {
          const combinedError = progress.errorMessage 
            ? `${progress.errorMessage} | ${errorMessage}`
            : errorMessage;

          await db.update(mangaImportProgress)
            .set({
              errorMessage: combinedError,
              updatedAt: new Date(),
            })
            .where(eq(mangaImportProgress.seriesId, seriesId));
          
          // Publish updated progress with accumulated errors
          const updatedProgress: MangaProgress = {
            ...progress,
            errorMessage: combinedError,
            updatedAt: new Date(),
          };
          await this.publishProgress(seriesId, updatedProgress);

          logger.debug(
            `Updated error message for failed series ${seriesId}`,
            { service: 'mangaProgressService' }
          );
        }
        return;
      }

      // Validate state transition - can fail from scanning or downloading
      const newStatus: ProgressStatus = 'failed';
      ProgressStateMachine.assertTransition(progress.status, newStatus);

      // Update database
      await db.update(mangaImportProgress)
        .set({
          status: newStatus,
          errorMessage,
          updatedAt: new Date(),
          completedAt: new Date(),
        })
        .where(eq(mangaImportProgress.seriesId, seriesId));

      // Update Redis
      const updatedProgress: MangaProgress = {
        ...progress,
        status: newStatus,
        errorMessage,
        updatedAt: new Date(),
        completedAt: new Date(),
      };

      await this.getRedis().setex(
        `${PROGRESS_CHANNEL_PREFIX}${seriesId}`,
        PROGRESS_TTL,
        JSON.stringify(updatedProgress)
      );

      // Publish update
      await this.publishProgress(seriesId, updatedProgress);

      logger.error(`Import failed for series ${seriesId}: ${errorMessage}`, { service: 'mangaProgressService' });
    } catch (error) {
      logger.error(`Failed to mark series ${seriesId} as failed: ${error}`, { service: 'mangaProgressService' });
      // Don't rethrow - allow other retries to continue even if we can't update status
    }
  }

  // Mark import as completed without downloading (for rescans with no new chapters)
  async markCompleted(seriesId: number, totalChapters: number): Promise<void> {
    try {
      const progress = await this.getProgress(seriesId);
      if (!progress) {
        logger.warn(`No progress found for series ${seriesId} when marking as completed`, { service: 'mangaProgressService' });
        return;
      }

      const newStatus: ProgressStatus = 'completed';
      ProgressStateMachine.assertTransition(progress.status, newStatus);

      logger.debug(`Marking series ${seriesId} as completed with ${totalChapters} chapters`, { service: 'mangaProgressService' });

      // Update database
      await db.update(mangaImportProgress)
        .set({
          totalChapters,
          downloadedChapters: totalChapters, // All chapters already downloaded
          status: newStatus,
          updatedAt: new Date(),
          completedAt: new Date(),
        })
        .where(eq(mangaImportProgress.seriesId, seriesId));

      // Update Redis
      const updatedProgress: MangaProgress = {
        ...progress,
        totalChapters,
        downloadedChapters: totalChapters,
        status: newStatus,
        percentage: 100,
        updatedAt: new Date(),
        completedAt: new Date(),
      };

      await this.getRedis().setex(
        `${PROGRESS_CHANNEL_PREFIX}${seriesId}`,
        PROGRESS_TTL,
        JSON.stringify(updatedProgress)
      );

      // Publish update
      await this.publishProgress(seriesId, updatedProgress);

      logger.info(`Marked series ${seriesId} as completed with ${totalChapters} chapters`, { service: 'mangaProgressService' });

      // Auto-cleanup after 5 minutes
      setTimeout(() => this.cleanupProgress(seriesId), 5 * 60 * 1000);
    } catch (error) {
      logger.error(`Failed to mark series ${seriesId} as completed: ${error}`, { service: 'mangaProgressService' });
    }
  }

  // Get current progress
  async getProgress(seriesId: number): Promise<MangaProgress | null> {
    try {
      // Try Redis first (faster)
      const redisData = await this.getRedis().get(`${PROGRESS_CHANNEL_PREFIX}${seriesId}`);
      if (redisData) {
        const parsed = JSON.parse(redisData);
        // Convert date strings back to Date objects
        return {
          ...parsed,
          startedAt: new Date(parsed.startedAt),
          updatedAt: new Date(parsed.updatedAt),
          completedAt: parsed.completedAt ? new Date(parsed.completedAt) : null,
        };
      }

      // Fallback to database
      const dbProgress = await db.query.mangaImportProgress.findFirst({
        where: eq(mangaImportProgress.seriesId, seriesId),
      });

      if (!dbProgress) return null;

      const progress: MangaProgress = {
        seriesId: dbProgress.seriesId,
        totalChapters: dbProgress.totalChapters,
        downloadedChapters: dbProgress.downloadedChapters,
        status: dbProgress.status,
        percentage: dbProgress.totalChapters > 0
          ? Math.round((dbProgress.downloadedChapters / dbProgress.totalChapters) * 100)
          : (dbProgress.status === 'completed' ? 100 : 0), // Show 100% if completed with 0 chapters, 0% if still scanning
        startedAt: dbProgress.startedAt,
        updatedAt: dbProgress.updatedAt,
        completedAt: dbProgress.completedAt,
        errorMessage: dbProgress.errorMessage,
        scraperId: dbProgress.scraperId ?? undefined,
        scraperUrl: dbProgress.scraperUrl ?? undefined,
      };

      // Repopulate Redis cache
      await this.getRedis().setex(
        `${PROGRESS_CHANNEL_PREFIX}${seriesId}`,
        PROGRESS_TTL,
        JSON.stringify(progress)
      );

      return progress;
    } catch (error) {
      logger.error(`Failed to get progress for series ${seriesId}: ${error}`, { service: 'mangaProgressService' });
      return null;
    }
  }

  // Publish progress update to Redis pub/sub
  private async publishProgress(seriesId: number, progress: MangaProgress): Promise<void> {
    try {
      // Publish via Redis for backward compatibility and cross-instance communication
      await this.getRedis().publish(
        `${PROGRESS_CHANNEL_PREFIX}${seriesId}`,
        JSON.stringify(progress)
      );

      // Also broadcast via WebSocket for direct client updates
      const io = getIOInstance();
      if (io) {
        const room = `manga:progress:${seriesId}`;
        const message = { type: 'progress', data: progress };
        io.of('/progress').to(room).emit('progress', message);

        // Send terminal state message
        if (progress.status === 'completed' || progress.status === 'failed') {
          const doneMessage = { type: 'done', data: progress };
          io.of('/progress').to(room).emit('progress', doneMessage);
          logger.info(`Import ${progress.status} for series ${seriesId}, sent close signal via WebSocket`, {
            service: 'mangaProgressService',
          });
        }
      }
    } catch (error) {
      logger.error(`Failed to publish progress for series ${seriesId}: ${error}`, { service: 'mangaProgressService' });
    }
  }

  // Cleanup old progress data
  async cleanupProgress(seriesId: number): Promise<void> {
    try {
      await this.getRedis().del(`${PROGRESS_CHANNEL_PREFIX}${seriesId}`);
      logger.info(`Cleaned up progress data for series ${seriesId}`, { service: 'mangaProgressService' });
    } catch (error) {
      logger.error(`Failed to cleanup progress for series ${seriesId}: ${error}`, { service: 'mangaProgressService' });
    }
  }

  /**
   * Set the scraper source for a series (admin override).
   * Updates manga_import_progress.scraperId and scraperUrl so the next scan uses this source.
   */
  async setScraperMatch(seriesId: number, scraperId: string, scraperUrl: string): Promise<void> {
    try {
      const [existing] = await db
        .select()
        .from(mangaImportProgress)
        .where(eq(mangaImportProgress.seriesId, seriesId))
        .limit(1);

      if (existing) {
        await db
          .update(mangaImportProgress)
          .set({
            scraperId,
            scraperUrl,
            updatedAt: new Date(),
          })
          .where(eq(mangaImportProgress.seriesId, seriesId));
      } else {
        await db.insert(mangaImportProgress).values({
          seriesId,
          totalChapters: 0,
          downloadedChapters: 0,
          status: 'scanning',
          scraperId,
          scraperUrl,
          startedAt: new Date(),
          updatedAt: new Date(),
        });
      }

      await this.getRedis().del(`${PROGRESS_CHANNEL_PREFIX}${seriesId}`);
      logger.info(`Set scraper match for series ${seriesId}: ${scraperId}`, { service: 'mangaProgressService' });
    } catch (error) {
      logger.error(`Failed to set scraper match for series ${seriesId}: ${error}`, { service: 'mangaProgressService' });
      throw error;
    }
  }

  // Get valid state transitions for a given status
  getValidTransitions(status: ProgressStatus): ProgressStatus[] {
    return ProgressStateMachine.getValidTransitions(status);
  }
}

export const mangaProgressService = new MangaProgressService();
export { ProgressStateMachine };
