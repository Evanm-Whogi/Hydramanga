import type { Job } from 'bullmq';
import { db } from '@/db';
import {
  chapters,
  series,
  seriesBookmarks,
  curatedListItems,
  comments,
  reviews,
  mangaViews,
  mangaViewStats,
  chapterViews,
  userReadingProgress,
  userReadingTime,
  userFavoriteSeries,
  importRequests,
  mangaImportProgress,
} from '@/db/schema';
import { and, eq, inArray, count } from 'drizzle-orm';
import { appConfig } from '@/config/appConfig';
import { chapterStorageService } from '@/services/chapterStorageService';
import { mangaOrchestratorService } from '@/services/mangaOrchestratorService';
import { mangaProgressService } from '@/services/mangaProgressService';
import { cacheService } from '@/services/cacheService';
import { invalidateCatalogCaches } from '@/lib/catalogCache';
import logger from '@/services/loggerService';
import { setJobProgress } from '@/utils/jobProgress';

export interface SeriesMigrationJobPayload {
  sourceSeriesId: number;
  targetSeriesId: number;
  triggeredBy?: string;
}

export interface SeriesMigrationPreview {
  valid: boolean;
  error?: string;
  sourceSeriesId: number;
  targetSeriesId: number;
  sourceTitle?: string;
  targetTitle?: string;
  sourceChapterCount: number;
  toMigrateCount: number;
  conflictCount: number;
  conflictChapterNumbers: string[];
}

export interface SeriesMigrationResult {
  migratedCount: number;
  conflictCount: number;
  diskFailures: string[];
}

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

class SeriesMigrationService {
  buildJobId(sourceSeriesId: number, targetSeriesId: number): string {
    return `migrate-${sourceSeriesId}-to-${targetSeriesId}`;
  }

  async preparePreview(sourceSeriesId: number, targetSeriesId: number): Promise<SeriesMigrationPreview> {
    const base = { sourceSeriesId, targetSeriesId, sourceChapterCount: 0, toMigrateCount: 0, conflictCount: 0, conflictChapterNumbers: [] as string[] };

    if (sourceSeriesId === targetSeriesId) {
      return { ...base, valid: false, error: 'Source and target series must be different' };
    }

    const [sourceRow, targetRow] = await Promise.all([
      db.select({ id: series.id, title: series.title }).from(series).where(eq(series.id, sourceSeriesId)).limit(1),
      db.select({ id: series.id, title: series.title }).from(series).where(eq(series.id, targetSeriesId)).limit(1),
    ]);

    if (!sourceRow[0]) return { ...base, valid: false, error: 'Source series not found' };
    if (!targetRow[0]) return { ...base, valid: false, error: 'Target series not found' };

    const sourceChapters = await db
      .select({ id: chapters.id, chapterNumber: chapters.chapterNumber, storagePrefix: chapters.storagePrefix })
      .from(chapters)
      .where(eq(chapters.seriesId, sourceSeriesId));

    if (sourceChapters.length === 0) {
      return { ...base, valid: false, error: 'Source series has no chapters to migrate', sourceTitle: sourceRow[0].title ?? undefined, targetTitle: targetRow[0].title ?? undefined };
    }

    const targetChapterNumbers = new Set(
      (await db.select({ chapterNumber: chapters.chapterNumber }).from(chapters).where(eq(chapters.seriesId, targetSeriesId))).map((r) => r.chapterNumber)
    );

    const conflicts = sourceChapters.filter((ch) => targetChapterNumbers.has(ch.chapterNumber));
    const toMigrate = sourceChapters.filter((ch) => !targetChapterNumbers.has(ch.chapterNumber));

    return {
      valid: true,
      sourceSeriesId,
      targetSeriesId,
      sourceTitle: sourceRow[0].title ?? undefined,
      targetTitle: targetRow[0].title ?? undefined,
      sourceChapterCount: sourceChapters.length,
      toMigrateCount: toMigrate.length,
      conflictCount: conflicts.length,
      conflictChapterNumbers: conflicts.map((c) => c.chapterNumber),
    };
  }

  async migrateSeries(payload: SeriesMigrationJobPayload, job?: Job): Promise<SeriesMigrationResult> {
    const { sourceSeriesId, targetSeriesId } = payload;
    await setJobProgress(job, 2);
    const preview = await this.preparePreview(sourceSeriesId, targetSeriesId);
    if (!preview.valid) throw new Error(preview.error || 'Invalid migration');
    await setJobProgress(job, 5);

    const [sourceProgressSnapshot] = await db
      .select()
      .from(mangaImportProgress)
      .where(eq(mangaImportProgress.seriesId, sourceSeriesId))
      .limit(1);

    await mangaOrchestratorService.cancelScan(sourceSeriesId);
    await mangaProgressService.cleanupProgress(sourceSeriesId);

    const sourceChapters = await db
      .select({ id: chapters.id, chapterNumber: chapters.chapterNumber, storagePrefix: chapters.storagePrefix })
      .from(chapters)
      .where(eq(chapters.seriesId, sourceSeriesId));

    const targetChapterNumbers = new Set(
      (await db.select({ chapterNumber: chapters.chapterNumber }).from(chapters).where(eq(chapters.seriesId, targetSeriesId))).map((r) => r.chapterNumber)
    );

    const conflictChapters = sourceChapters.filter((ch) => targetChapterNumbers.has(ch.chapterNumber));
    const toMigrate = sourceChapters.filter((ch) => !targetChapterNumbers.has(ch.chapterNumber));
    const conflictPrefixes = conflictChapters.map((ch) => ch.storagePrefix);
    const migrateMoves: Array<{ oldPrefix: string; newPrefix: string; chapterId: number }> = toMigrate.map((ch) => ({
      chapterId: ch.id,
      oldPrefix: ch.storagePrefix,
      newPrefix: `${targetSeriesId}/${ch.chapterNumber}`,
    }));

    await setJobProgress(job, 8);
    await db.transaction(async (tx) => {
      if (conflictChapters.length > 0) {
        await tx.delete(chapters).where(inArray(chapters.id, conflictChapters.map((c) => c.id)));
      }

      for (const ch of toMigrate) {
        await tx
          .update(chapters)
          .set({
            seriesId: targetSeriesId,
            storagePrefix: `${targetSeriesId}/${ch.chapterNumber}`,
            updatedAt: new Date(),
          })
          .where(eq(chapters.id, ch.id));
      }

      await this.migrateEngagementData(tx, sourceSeriesId, targetSeriesId);
      await this.migrateImportProgress(tx, sourceProgressSnapshot ?? null, targetSeriesId);
      await tx.delete(mangaImportProgress).where(eq(mangaImportProgress.seriesId, sourceSeriesId));
    });

    await mangaProgressService.cleanupProgress(sourceSeriesId);
    await mangaProgressService.cleanupProgress(targetSeriesId);

    const diskFailures: string[] = [];
    const storageRoot = appConfig.scraper?.chapterStorageRoot;
    if (storageRoot) {
      if (job) await job.updateProgress(10);
      for (let i = 0; i < migrateMoves.length; i++) {
        const move = migrateMoves[i];
        const failure = await chapterStorageService.moveChapterStorage(storageRoot, move.oldPrefix, move.newPrefix);
        if (failure) diskFailures.push(failure);
        if (job && migrateMoves.length > 0) {
          await job.updateProgress(10 + Math.round(((i + 1) / migrateMoves.length) * 70));
        }
      }

      if (conflictPrefixes.length > 0) {
        const cleanupFailed = await chapterStorageService.removeChapterStorage(storageRoot, sourceSeriesId, conflictPrefixes, false);
        diskFailures.push(...cleanupFailed);
      }

      await chapterStorageService.removeEmptySeriesDir(storageRoot, sourceSeriesId);
      if (job) await job.updateProgress(90);
    }

    await Promise.all([
      cacheService.invalidatePattern(`manga:${sourceSeriesId}:*`),
      cacheService.invalidatePattern(`manga:${targetSeriesId}:*`),
      cacheService.invalidatePattern(`series:${sourceSeriesId}:*`),
      cacheService.invalidatePattern(`series:${targetSeriesId}:*`),
      invalidateCatalogCaches(),
    ]);

    if (job) await job.updateProgress(100);

    logger.info(`Migrated series ${sourceSeriesId} → ${targetSeriesId}: ${toMigrate.length} chapters, ${conflictChapters.length} conflicts skipped`, { service: 'seriesMigrationService' });

    return { migratedCount: toMigrate.length, conflictCount: conflictChapters.length, diskFailures };
  }

  private async migrateEngagementData(tx: DbTx, sourceSeriesId: number, targetSeriesId: number): Promise<void> {
    await this.migrateBookmarks(tx, sourceSeriesId, targetSeriesId);
    await this.migrateReviews(tx, sourceSeriesId, targetSeriesId);
    await this.migrateFavorites(tx, sourceSeriesId, targetSeriesId);
    await this.migrateCuratedListItems(tx, sourceSeriesId, targetSeriesId);
    await tx.update(comments).set({ seriesId: targetSeriesId }).where(eq(comments.seriesId, sourceSeriesId));
    await tx.update(chapterViews).set({ seriesId: targetSeriesId }).where(eq(chapterViews.seriesId, sourceSeriesId));
    await tx.update(mangaViews).set({ seriesId: targetSeriesId }).where(eq(mangaViews.seriesId, sourceSeriesId));
    await this.mergeMangaViewStats(tx, sourceSeriesId, targetSeriesId);
    await this.mergeUserReadingProgress(tx, sourceSeriesId, targetSeriesId);
    await this.mergeUserReadingTime(tx, sourceSeriesId, targetSeriesId);
    await tx.update(importRequests).set({ seriesId: targetSeriesId }).where(eq(importRequests.seriesId, sourceSeriesId));
  }

  private async migrateBookmarks(tx: DbTx, sourceSeriesId: number, targetSeriesId: number): Promise<void> {
    const targetUserIds = (await tx.select({ userId: seriesBookmarks.userId }).from(seriesBookmarks).where(eq(seriesBookmarks.seriesId, targetSeriesId))).map((r) => r.userId);
    if (targetUserIds.length > 0) {
      await tx.delete(seriesBookmarks).where(and(eq(seriesBookmarks.seriesId, sourceSeriesId), inArray(seriesBookmarks.userId, targetUserIds)));
    }
    await tx.update(seriesBookmarks).set({ seriesId: targetSeriesId }).where(eq(seriesBookmarks.seriesId, sourceSeriesId));
  }

  private async migrateReviews(tx: DbTx, sourceSeriesId: number, targetSeriesId: number): Promise<void> {
    const targetUserIds = (await tx.select({ userId: reviews.userId }).from(reviews).where(eq(reviews.seriesId, targetSeriesId))).map((r) => r.userId);
    if (targetUserIds.length > 0) {
      await tx.delete(reviews).where(and(eq(reviews.seriesId, sourceSeriesId), inArray(reviews.userId, targetUserIds)));
    }
    await tx.update(reviews).set({ seriesId: targetSeriesId }).where(eq(reviews.seriesId, sourceSeriesId));
  }

  private async migrateFavorites(tx: DbTx, sourceSeriesId: number, targetSeriesId: number): Promise<void> {
    const targetUserIds = (await tx.select({ userId: userFavoriteSeries.userId }).from(userFavoriteSeries).where(eq(userFavoriteSeries.seriesId, targetSeriesId))).map((r) => r.userId);
    if (targetUserIds.length > 0) {
      await tx.delete(userFavoriteSeries).where(and(eq(userFavoriteSeries.seriesId, sourceSeriesId), inArray(userFavoriteSeries.userId, targetUserIds)));
    }
    await tx.update(userFavoriteSeries).set({ seriesId: targetSeriesId }).where(eq(userFavoriteSeries.seriesId, sourceSeriesId));
  }

  private async migrateCuratedListItems(tx: DbTx, sourceSeriesId: number, targetSeriesId: number): Promise<void> {
    const targetListIds = (await tx.select({ listId: curatedListItems.listId }).from(curatedListItems).where(eq(curatedListItems.seriesId, targetSeriesId))).map((r) => r.listId);
    if (targetListIds.length > 0) {
      await tx.delete(curatedListItems).where(and(eq(curatedListItems.seriesId, sourceSeriesId), inArray(curatedListItems.listId, targetListIds)));
    }
    await tx.update(curatedListItems).set({ seriesId: targetSeriesId }).where(eq(curatedListItems.seriesId, sourceSeriesId));
  }

  private async mergeMangaViewStats(tx: DbTx, sourceSeriesId: number, targetSeriesId: number): Promise<void> {
    const [sourceStats] = await tx.select().from(mangaViewStats).where(eq(mangaViewStats.seriesId, sourceSeriesId)).limit(1);
    if (!sourceStats) return;

    const [targetStats] = await tx.select().from(mangaViewStats).where(eq(mangaViewStats.seriesId, targetSeriesId)).limit(1);
    if (targetStats) {
      const lastViewedAt =
        sourceStats.lastViewedAt && targetStats.lastViewedAt
          ? sourceStats.lastViewedAt > targetStats.lastViewedAt
            ? sourceStats.lastViewedAt
            : targetStats.lastViewedAt
          : sourceStats.lastViewedAt ?? targetStats.lastViewedAt;
      await tx
        .update(mangaViewStats)
        .set({
          totalViews: targetStats.totalViews + sourceStats.totalViews,
          uniqueViews: targetStats.uniqueViews + sourceStats.uniqueViews,
          lastViewedAt,
          updatedAt: new Date(),
        })
        .where(eq(mangaViewStats.seriesId, targetSeriesId));
    } else {
      await tx.insert(mangaViewStats).values({
        seriesId: targetSeriesId,
        totalViews: sourceStats.totalViews,
        uniqueViews: sourceStats.uniqueViews,
        lastViewedAt: sourceStats.lastViewedAt,
        updatedAt: new Date(),
      });
    }
    await tx.delete(mangaViewStats).where(eq(mangaViewStats.seriesId, sourceSeriesId));
  }

  private async mergeUserReadingProgress(tx: DbTx, sourceSeriesId: number, targetSeriesId: number): Promise<void> {
    const sourceRows = await tx.select().from(userReadingProgress).where(eq(userReadingProgress.seriesId, sourceSeriesId));
    const targetRows = await tx.select().from(userReadingProgress).where(eq(userReadingProgress.seriesId, targetSeriesId));
    const targetByUser = new Map(targetRows.map((r) => [r.userId, r]));

    for (const sourceRow of sourceRows) {
      const targetRow = targetByUser.get(sourceRow.userId);
      if (!targetRow) {
        await tx.update(userReadingProgress).set({ seriesId: targetSeriesId }).where(and(eq(userReadingProgress.userId, sourceRow.userId), eq(userReadingProgress.seriesId, sourceSeriesId)));
        continue;
      }

      const sourceBetter =
        sourceRow.percentageCompleted > targetRow.percentageCompleted ||
        (sourceRow.percentageCompleted === targetRow.percentageCompleted && sourceRow.updatedAt > targetRow.updatedAt);

      if (sourceBetter) {
        await tx
          .update(userReadingProgress)
          .set({
            lastChapterId: sourceRow.lastChapterId,
            lastPageNumber: sourceRow.lastPageNumber,
            totalPagesRead: sourceRow.totalPagesRead,
            percentageCompleted: sourceRow.percentageCompleted,
            updatedAt: sourceRow.updatedAt,
          })
          .where(and(eq(userReadingProgress.userId, sourceRow.userId), eq(userReadingProgress.seriesId, targetSeriesId)));
      }
      await tx.delete(userReadingProgress).where(and(eq(userReadingProgress.userId, sourceRow.userId), eq(userReadingProgress.seriesId, sourceSeriesId)));
    }
  }

  private async mergeUserReadingTime(tx: DbTx, sourceSeriesId: number, targetSeriesId: number): Promise<void> {
    const sourceRows = await tx.select().from(userReadingTime).where(eq(userReadingTime.seriesId, sourceSeriesId));

    for (const sourceRow of sourceRows) {
      const [targetRow] = await tx
        .select()
        .from(userReadingTime)
        .where(
          and(
            eq(userReadingTime.userId, sourceRow.userId),
            eq(userReadingTime.seriesId, targetSeriesId),
            eq(userReadingTime.chapterId, sourceRow.chapterId)
          )
        )
        .limit(1);

      if (targetRow) {
        await tx
          .update(userReadingTime)
          .set({
            seconds: targetRow.seconds + sourceRow.seconds,
            updatedAt: sourceRow.updatedAt > targetRow.updatedAt ? sourceRow.updatedAt : targetRow.updatedAt,
          })
          .where(
            and(
              eq(userReadingTime.userId, sourceRow.userId),
              eq(userReadingTime.seriesId, targetSeriesId),
              eq(userReadingTime.chapterId, sourceRow.chapterId)
            )
          );
        await tx.delete(userReadingTime).where(and(eq(userReadingTime.userId, sourceRow.userId), eq(userReadingTime.seriesId, sourceSeriesId), eq(userReadingTime.chapterId, sourceRow.chapterId)));
      } else {
        await tx
          .update(userReadingTime)
          .set({ seriesId: targetSeriesId })
          .where(and(eq(userReadingTime.userId, sourceRow.userId), eq(userReadingTime.seriesId, sourceSeriesId), eq(userReadingTime.chapterId, sourceRow.chapterId)));
      }
    }
  }

  private async migrateImportProgress(tx: DbTx, sourceProgress: typeof mangaImportProgress.$inferSelect | null, targetSeriesId: number): Promise<void> {
    const [{ total }] = await tx.select({ total: count() }).from(chapters).where(eq(chapters.seriesId, targetSeriesId));
    const chapterCount = Number(total);
    const scraperId = sourceProgress?.scraperId ?? null;
    const scraperUrl = sourceProgress?.scraperUrl ?? null;

    if (chapterCount === 0 && !scraperId && !scraperUrl) return;

    const now = new Date();
    const progressValues = {
      totalChapters: chapterCount,
      downloadedChapters: chapterCount,
      status: 'completed' as const,
      scraperId,
      scraperUrl,
      updatedAt: now,
      completedAt: now,
      errorMessage: null,
    };

    const [targetProgress] = await tx.select().from(mangaImportProgress).where(eq(mangaImportProgress.seriesId, targetSeriesId)).limit(1);
    if (targetProgress) {
      await tx.update(mangaImportProgress).set(progressValues).where(eq(mangaImportProgress.seriesId, targetSeriesId));
    } else {
      await tx.insert(mangaImportProgress).values({
        seriesId: targetSeriesId,
        ...progressValues,
        startedAt: sourceProgress?.startedAt ?? now,
      });
    }
  }
}

export const seriesMigrationService = new SeriesMigrationService();
