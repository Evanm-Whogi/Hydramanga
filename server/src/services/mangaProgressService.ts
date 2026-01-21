import { db } from '@/db';
import { mangaImportProgress } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { queueService } from '@/services/queueService';
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
  async setTotalChapters(seriesId: number, totalChapters: number): Promise<void> {
    try {
      const progress = await this.getProgress(seriesId);
      if (!progress) {
        logger.warn(`No progress found for series ${seriesId}, initializing...`, { service: 'mangaProgressService' });
        await this.initializeProgress(seriesId);
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
  async incrementDownloaded(seriesId: number): Promise<void> {
    try {
      const progress = await this.getProgress(seriesId);
      if (!progress) {
        logger.warn(`No progress found for series ${seriesId} when incrementing`, { service: 'mangaProgressService' });
        return;
      }

      const newDownloaded = progress.downloadedChapters + 1;
      const percentage = progress.totalChapters > 0
        ? Math.round((newDownloaded / progress.totalChapters) * 100)
        : 0;

      // Check if completed
      const isCompleted = newDownloaded >= progress.totalChapters && progress.totalChapters > 0;
      const newStatus: ProgressStatus = isCompleted ? 'completed' : 'downloading';

      // Validate state transition - should be in downloading state
      if (progress.status !== 'downloading') {
        logger.warn(
          `Cannot increment progress for series ${seriesId}: current status is ${progress.status}, expected 'downloading'`,
          { service: 'mangaProgressService' }
        );
        return;
      }

      // Update database
      await db.update(mangaImportProgress)
        .set({
          downloadedChapters: newDownloaded,
          status: newStatus,
          updatedAt: new Date(),
          ...(isCompleted && { completedAt: new Date() }),
        })
        .where(eq(mangaImportProgress.seriesId, seriesId));

      // Update Redis
      const updatedProgress: MangaProgress = {
        ...progress,
        downloadedChapters: newDownloaded,
        status: newStatus,
        percentage,
        updatedAt: new Date(),
        ...(isCompleted && { completedAt: new Date() }),
      };

      await this.getRedis().setex(
        `${PROGRESS_CHANNEL_PREFIX}${seriesId}`,
        PROGRESS_TTL,
        JSON.stringify(updatedProgress)
      );

      // Publish update
      await this.publishProgress(seriesId, updatedProgress);

      logger.info(
        `Progress updated for series ${seriesId}: ${newDownloaded}/${progress.totalChapters} (${percentage}%)`,
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
          : 0,
        startedAt: dbProgress.startedAt,
        updatedAt: dbProgress.updatedAt,
        completedAt: dbProgress.completedAt,
        errorMessage: dbProgress.errorMessage,
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
      await this.getRedis().publish(
        `${PROGRESS_CHANNEL_PREFIX}${seriesId}`,
        JSON.stringify(progress)
      );
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

  // Get valid state transitions for a given status
  getValidTransitions(status: ProgressStatus): ProgressStatus[] {
    return ProgressStateMachine.getValidTransitions(status);
  }
}

export const mangaProgressService = new MangaProgressService();
export { ProgressStateMachine };
