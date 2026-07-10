import { db } from '@/db';
import { acquisitionJobs, catalogScanState } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import logger from '@/services/loggerService';
import { queueService } from '@/services/queueService';
import { mangaOrchestratorService } from '@/services/mangaOrchestratorService';
import { mangaProgressService } from '@/services/mangaProgressService';
import { discordService } from '@/services/discordService';
import { appConfig } from '@/config/appConfig';

export const CATALOG_SCAN_COORDINATOR_QUEUE = 'catalogScanCoordinatorQueue';
const CATALOG_SCAN_STATE_ID = 1;
const ACTIVE_ARCHIVE_STATUSES = new Set(['searching', 'downloading', 'downloaded', 'ingesting']);
const TERMINAL_ARCHIVE_STATUSES = new Set(['done', 'failed', 'needs_review']);

export type CatalogScanStats = {
  queued: number;
  archived: number;
  skippedIgnored: number;
  skippedWithChapters: number;
  sourcesSelected: number;
  sourcesAlreadySet: number;
  sourcesNotFound: number;
  sourcesLowScore: number;
  batchesCompleted: number;
};

export type CatalogScanStartOptions = {
  batchSize?: number;
  type?: string;
  skipWithChapters?: boolean;
  autoSelectSource?: boolean;
  useArchive?: boolean;
  resume?: boolean;
};

export type CatalogScanPublicState = {
  status: 'idle' | 'running' | 'stopping' | 'completed';
  nextRank: number;
  batchSize: number;
  type: string | null;
  skipWithChapters: boolean;
  autoSelectSource: boolean;
  useArchive: boolean;
  currentBatchStart: number | null;
  currentBatchEnd: number | null;
  currentBatchSeriesIds: number[];
  currentBatchArchivedIds: number[];
  totalCatalogCount: number;
  stats: CatalogScanStats;
  progressPercent: number;
  currentBatchCompleted: number;
  currentBatchTotal: number;
  consecutiveFailures: number;
  pauseReason: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  updatedAt: string;
};

const EMPTY_STATS: CatalogScanStats = {
  queued: 0,
  archived: 0,
  skippedIgnored: 0,
  skippedWithChapters: 0,
  sourcesSelected: 0,
  sourcesAlreadySet: 0,
  sourcesNotFound: 0,
  sourcesLowScore: 0,
  batchesCompleted: 0,
};

function parseStats(raw: unknown): CatalogScanStats {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STATS };
  const s = raw as Partial<CatalogScanStats>;
  return {
    queued: Number(s.queued) || 0,
    archived: Number(s.archived) || 0,
    skippedIgnored: Number(s.skippedIgnored) || 0,
    skippedWithChapters: Number(s.skippedWithChapters) || 0,
    sourcesSelected: Number(s.sourcesSelected) || 0,
    sourcesAlreadySet: Number(s.sourcesAlreadySet) || 0,
    sourcesNotFound: Number(s.sourcesNotFound) || 0,
    sourcesLowScore: Number(s.sourcesLowScore) || 0,
    batchesCompleted: Number(s.batchesCompleted) || 0,
  };
}

function parseIdList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => Number(v)).filter((n) => Number.isFinite(n));
}

function mergeStats(base: CatalogScanStats, delta: Partial<CatalogScanStats>): CatalogScanStats {
  return {
    queued: base.queued + (delta.queued ?? 0),
    archived: base.archived + (delta.archived ?? 0),
    skippedIgnored: base.skippedIgnored + (delta.skippedIgnored ?? 0),
    skippedWithChapters: base.skippedWithChapters + (delta.skippedWithChapters ?? 0),
    sourcesSelected: base.sourcesSelected + (delta.sourcesSelected ?? 0),
    sourcesAlreadySet: base.sourcesAlreadySet + (delta.sourcesAlreadySet ?? 0),
    sourcesNotFound: base.sourcesNotFound + (delta.sourcesNotFound ?? 0),
    sourcesLowScore: base.sourcesLowScore + (delta.sourcesLowScore ?? 0),
    batchesCompleted: base.batchesCompleted + (delta.batchesCompleted ?? 0),
  };
}

class CatalogScanService {
  private async ensureRow() {
    const existing = await db.select({ id: catalogScanState.id }).from(catalogScanState).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID)).limit(1);
    if (existing.length === 0) {
      await db.insert(catalogScanState).values({ id: CATALOG_SCAN_STATE_ID });
    }
  }

  private async loadRow() {
    const [row] = await db.select().from(catalogScanState).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID)).limit(1);
    return row ?? null;
  }

  async rescheduleIfActive(delayMs = appConfig.catalogScan.pollIntervalMs): Promise<void> {
    const row = await this.loadRow();
    if (row?.status === 'running' || row?.status === 'stopping') {
      await this.enqueueCoordinatorTick(delayMs);
    }
  }

  private mapRow(row: typeof catalogScanState.$inferSelect): CatalogScanPublicState {
    const currentBatchSeriesIds = parseIdList(row.currentBatchSeriesIds);
    const currentBatchArchivedIds = parseIdList(row.currentBatchArchivedIds);
    const currentBatchTotal = currentBatchSeriesIds.length + currentBatchArchivedIds.length;
    const totalCatalogCount = row.totalCatalogCount || 0;
    const progressPercent = totalCatalogCount > 0 ? Math.min(100, Math.round(((row.nextRank - 1) / totalCatalogCount) * 100)) : 0;
    return {
      status: row.status,
      nextRank: row.nextRank,
      batchSize: row.batchSize,
      type: row.type,
      skipWithChapters: row.skipWithChapters,
      autoSelectSource: row.autoSelectSource,
      useArchive: row.useArchive,
      currentBatchStart: row.currentBatchStart,
      currentBatchEnd: row.currentBatchEnd,
      currentBatchSeriesIds,
      currentBatchArchivedIds,
      totalCatalogCount,
      stats: parseStats(row.stats),
      progressPercent,
      currentBatchCompleted: 0,
      currentBatchTotal,
      consecutiveFailures: row.consecutiveFailures,
      pauseReason: row.pauseReason,
      startedAt: row.startedAt?.toISOString() ?? null,
      stoppedAt: row.stoppedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getState(): Promise<CatalogScanPublicState> {
    await this.ensureRow();
    const [row] = await db.select().from(catalogScanState).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID)).limit(1);
    if (!row) throw new Error('catalog_scan_state row missing');
    const state = this.mapRow(row);
    if (state.currentBatchTotal > 0) {
      const [scrapeDone, archiveDone] = await Promise.all([
        this.countTerminalScrapeSeries(state.currentBatchSeriesIds),
        this.countTerminalArchivedSeries(state.currentBatchArchivedIds),
      ]);
      state.currentBatchCompleted = scrapeDone + archiveDone;
    }
    return state;
  }

  private async countTerminalScrapeSeries(seriesIds: number[]): Promise<number> {
    let count = 0;
    for (const seriesId of seriesIds) {
      if (await this.isScrapeSeriesTerminal(seriesId)) count++;
    }
    return count;
  }

  private async countTerminalArchivedSeries(seriesIds: number[]): Promise<number> {
    let count = 0;
    for (const seriesId of seriesIds) {
      if (await this.isArchivedSeriesTerminal(seriesId)) count++;
    }
    return count;
  }

  private async isScrapeSeriesTerminal(seriesId: number): Promise<boolean> {
    const { scanStatus } = await mangaOrchestratorService.getScanStatus(seriesId);
    return scanStatus !== 'scanning' && scanStatus !== 'downloading' && scanStatus !== 'queued' && scanStatus !== 'source_set';
  }

  private async isArchivedSeriesTerminal(seriesId: number): Promise<boolean> {
    const [job] = await db
      .select({ status: acquisitionJobs.status })
      .from(acquisitionJobs)
      .where(eq(acquisitionJobs.seriesId, seriesId))
      .orderBy(desc(acquisitionJobs.createdAt))
      .limit(1);
    if (!job) return true;
    if (ACTIVE_ARCHIVE_STATUSES.has(job.status)) return false;
    if (!TERMINAL_ARCHIVE_STATUSES.has(job.status)) return false;
    const { scanStatus } = await mangaOrchestratorService.getScanStatus(seriesId);
    return scanStatus !== 'scanning' && scanStatus !== 'downloading' && scanStatus !== 'queued';
  }

  private async isBatchComplete(seriesIds: number[], archivedIds: number[]): Promise<boolean> {
    if (seriesIds.length === 0 && archivedIds.length === 0) return true;
    const [scrapeDone, archiveDone] = await Promise.all([
      this.countTerminalScrapeSeries(seriesIds),
      this.countTerminalArchivedSeries(archivedIds),
    ]);
    return scrapeDone === seriesIds.length && archiveDone === archivedIds.length;
  }

  /**
   * Circuit-breaker classification for a completed batch (order-independent, batch-level):
   * count clear successes vs. failures across both the scrape and archive series.
   * `treatNonTerminalAsFailure` is set only by the stall watchdog, where a series still
   * stuck mid-flight is itself the problem.
   */
  private async classifyBatchOutcome(seriesIds: number[], archivedIds: number[], treatNonTerminalAsFailure: boolean): Promise<{ successCount: number; failureCount: number; sampleReason: string | null }> {
    let successCount = 0;
    let failureCount = 0;
    let sampleReason: string | null = null;
    const noteFailure = (reason: string) => { failureCount++; if (!sampleReason) sampleReason = reason; };

    for (const seriesId of seriesIds) {
      const progress = await mangaProgressService.getProgress(seriesId);
      if (!progress) { if (treatNonTerminalAsFailure) noteFailure(`series ${seriesId}: no progress row`); continue; }
      const tag = progress.scraperId ? ` [${progress.scraperId}]` : '';
      if (progress.status === 'failed') { noteFailure(`series ${seriesId}${tag}: ${progress.errorMessage || 'scan failed'}`); continue; }
      if (progress.status === 'source_set') { noteFailure(`series ${seriesId}${tag}: source selected but chapter scan never ran`); continue; }
      if (progress.status === 'completed') {
        if (progress.totalChapters === 0) continue; // neutral: legitimately empty series
        if (progress.downloadedChapters > 0) { successCount++; continue; } // success (incl. partial w/ placeholders)
        if ((progress.failedChapters ?? 0) > 0) { noteFailure(`series ${seriesId}${tag}: all ${progress.failedChapters} chapter(s) failed`); continue; } // empty completion
        continue; // neutral (completed but nothing processed — unexpected)
      }
      // Non-terminal (downloading/scanning/queued/source_set).
      if (treatNonTerminalAsFailure) noteFailure(`series ${seriesId}${tag}: stuck in ${progress.status}`);
    }

    for (const seriesId of archivedIds) {
      const [job] = await db
        .select({ status: acquisitionJobs.status })
        .from(acquisitionJobs)
        .where(eq(acquisitionJobs.seriesId, seriesId))
        .orderBy(desc(acquisitionJobs.createdAt))
        .limit(1);
      if (!job) { if (treatNonTerminalAsFailure) noteFailure(`series ${seriesId}: no archive job`); continue; }
      if (job.status === 'done') { successCount++; continue; }
      if (job.status === 'failed' || job.status === 'needs_review') { noteFailure(`series ${seriesId}: archive ${job.status}`); continue; }
      if (treatNonTerminalAsFailure) noteFailure(`series ${seriesId}: archive ${job.status}`);
    }

    return { successCount, failureCount, sampleReason };
  }

  /**
   * Update the consecutive-failure streak from a completed batch and auto-pause when it
   * crosses the threshold. Rule: any success in the batch resets the streak to 0; otherwise
   * the streak grows by the number of failures. Returns true when the scan was paused.
   */
  private async applyBatchOutcomeAndMaybePause(row: typeof catalogScanState.$inferSelect, seriesIds: number[], archivedIds: number[], opts: { treatNonTerminalAsFailure?: boolean }): Promise<boolean> {
    const { successCount, failureCount, sampleReason } = await this.classifyBatchOutcome(seriesIds, archivedIds, opts.treatNonTerminalAsFailure ?? false);
    const prevStreak = row.consecutiveFailures ?? 0;
    const newStreak = successCount >= 1 ? 0 : prevStreak + failureCount;

    await db.update(catalogScanState).set({ consecutiveFailures: newStreak, updatedAt: new Date() }).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID));
    logger.info(`Catalog batch outcome: ${successCount} success, ${failureCount} failure → consecutiveFailures=${newStreak}`, { service: 'catalogScanService' });

    const maxConsecutive = appConfig.catalogScan.maxConsecutiveFailures;
    if (maxConsecutive > 0 && newStreak >= maxConsecutive) {
      const rollbackRank = row.currentBatchStart ?? row.nextRank;
      const pauseReason = `Auto-paused after ${newStreak} consecutive failed batches. Last failure: ${sampleReason || 'unknown'}`;
      await this.pauseRun(pauseReason, rollbackRank);
      logger.warn(`Catalog scan auto-paused at rank ${rollbackRank}: ${pauseReason}`, { service: 'catalogScanService' });
      try {
        await discordService.notifyCatalogScanPaused(rollbackRank, newStreak, pauseReason);
      } catch (err) {
        logger.error(`Failed to send catalog pause Discord notification: ${err}`, { service: 'catalogScanService' });
      }
      return true;
    }
    return false;
  }

  /** Pause the scan to idle, preserving pauseReason and rolling the cursor back so the failed batch is re-attempted on resume. */
  private async pauseRun(pauseReason: string, rollbackToRank: number) {
    const now = new Date();
    await db.update(catalogScanState).set({
      status: 'idle',
      nextRank: rollbackToRank,
      pauseReason,
      currentBatchStart: null,
      currentBatchEnd: null,
      currentBatchSeriesIds: [],
      currentBatchArchivedIds: [],
      currentBatchStartedAt: null,
      stoppedAt: now,
      updatedAt: now,
    }).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID));
  }

  async enqueueCoordinatorTick(delayMs = 0): Promise<void> {
    await queueService.addJob(
      CATALOG_SCAN_COORDINATOR_QUEUE,
      'catalog-scan-tick',
      {},
      { jobId: `catalog-scan-tick-${Date.now()}`, delay: delayMs, attempts: 1, removeOnComplete: true }
    );
  }

  async recoverOnStartup(): Promise<void> {
    await this.ensureRow();
    const [row] = await db.select().from(catalogScanState).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID)).limit(1);
    if (row && (row.status === 'running' || row.status === 'stopping')) {
      logger.info(`Recovering catalog scan coordinator (status=${row.status}, nextRank=${row.nextRank})`, { service: 'catalogScanService' });
      await this.enqueueCoordinatorTick(1000);
    }
  }

  async start(options: CatalogScanStartOptions = {}): Promise<CatalogScanPublicState> {
    await this.ensureRow();
    const [existing] = await db.select().from(catalogScanState).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID)).limit(1);
    if (existing?.status === 'running' || existing?.status === 'stopping') {
      throw new Error('Catalog scan is already active');
    }

    const batchSize = Math.min(100, Math.max(25, Math.floor(options.batchSize ?? existing?.batchSize ?? 50)));
    const type = options.type?.trim() || null;
    const skipWithChapters = options.skipWithChapters ?? existing?.skipWithChapters ?? true;
    const autoSelectSource = options.autoSelectSource ?? existing?.autoSelectSource ?? true;
    const useArchive = options.useArchive ?? existing?.useArchive ?? true;
    const resume = options.resume === true;
    const nextRank = resume && existing && existing.nextRank > 1 ? existing.nextRank : 1;
    const totalCatalogCount = await mangaOrchestratorService.countRankedCatalog(type ?? undefined);
    const now = new Date();

    await db.update(catalogScanState).set({
      status: 'running',
      nextRank,
      batchSize,
      type,
      skipWithChapters,
      autoSelectSource,
      useArchive,
      currentBatchStart: null,
      currentBatchEnd: null,
      currentBatchSeriesIds: [],
      currentBatchArchivedIds: [],
      currentBatchStartedAt: null,
      consecutiveFailures: 0,
      pauseReason: null,
      totalCatalogCount,
      stats: resume && existing ? existing.stats : EMPTY_STATS,
      startedAt: now,
      stoppedAt: null,
      updatedAt: now,
    }).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID));

    await this.enqueueCoordinatorTick(500);
    return this.getState();
  }

  async stop(): Promise<CatalogScanPublicState> {
    await this.ensureRow();
    const [row] = await db.select().from(catalogScanState).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID)).limit(1);
    if (!row || row.status === 'idle' || row.status === 'completed') {
      return this.getState();
    }
    await db.update(catalogScanState).set({ status: 'stopping', updatedAt: new Date() }).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID));
    await this.enqueueCoordinatorTick(500);
    return this.getState();
  }

  async forceStop(): Promise<CatalogScanPublicState> {
    await this.ensureRow();
    const [row] = await db.select().from(catalogScanState).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID)).limit(1);
    if (!row || row.status === 'idle' || row.status === 'completed') {
      return this.getState();
    }
    // Finalize immediately without waiting for the current batch to reach a terminal state.
    // Used when the batch's jobs were cancelled/adjusted manually and will never complete on their own.
    // The cursor (nextRank) is preserved so the scan can still be resumed.
    await this.finishRun('idle', false);
    logger.warn(`Catalog scan force-stopped at rank ${row.nextRank} (batch discarded)`, { service: 'catalogScanService' });
    return this.getState();
  }

  async reset(): Promise<CatalogScanPublicState> {
    await this.ensureRow();
    const [row] = await db.select().from(catalogScanState).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID)).limit(1);
    if (row?.status === 'running' || row?.status === 'stopping') {
      throw new Error('Cannot reset while catalog scan is active');
    }
    const now = new Date();
    await db.update(catalogScanState).set({
      status: 'idle',
      nextRank: 1,
      currentBatchStart: null,
      currentBatchEnd: null,
      currentBatchSeriesIds: [],
      currentBatchArchivedIds: [],
      currentBatchStartedAt: null,
      consecutiveFailures: 0,
      pauseReason: null,
      stats: EMPTY_STATS,
      startedAt: null,
      stoppedAt: null,
      updatedAt: now,
    }).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID));
    return this.getState();
  }

  private async clearActiveBatch() {
    await db.update(catalogScanState).set({
      currentBatchStart: null,
      currentBatchEnd: null,
      currentBatchSeriesIds: [],
      currentBatchArchivedIds: [],
      currentBatchStartedAt: null,
      updatedAt: new Date(),
    }).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID));
  }

  private async finishRun(status: 'idle' | 'completed', notify: boolean) {
    const now = new Date();
    const [row] = await db.select().from(catalogScanState).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID)).limit(1);
    await db.update(catalogScanState).set({
      status,
      currentBatchStart: null,
      currentBatchEnd: null,
      currentBatchSeriesIds: [],
      currentBatchArchivedIds: [],
      currentBatchStartedAt: null,
      pauseReason: null,
      stoppedAt: now,
      updatedAt: now,
    }).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID));
    if (notify && status === 'completed' && row) {
      const stats = parseStats(row.stats);
      await discordService.notifyCatalogScanCompleted(row.nextRank, stats, row.type);
    }
  }

  private async isBackpressureActive(): Promise<boolean> {
    const queue = queueService.getQueue('mangaChapterImportQueue');
    const counts = await queue.getJobCounts('waiting', 'delayed', 'prioritized');
    const waiting = (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.prioritized ?? 0);
    return waiting >= appConfig.catalogScan.maxQueueDepth;
  }

  async processTick(): Promise<void> {
    await this.ensureRow();
    let row = await this.loadRow();
    if (!row) return;

    if (row.status === 'idle' || row.status === 'completed') return;

    const seriesIds = parseIdList(row.currentBatchSeriesIds);
    const archivedIds = parseIdList(row.currentBatchArchivedIds);
    const hasActiveBatch = row.currentBatchStart != null;

    if (hasActiveBatch) {
      const complete = await this.isBatchComplete(seriesIds, archivedIds);
      if (!complete) {
        // Watchdog: a batch that never reaches a terminal state (a job wedged so its
        // progress counters never resolve) would otherwise poll forever. Past the stall
        // window, force-terminate it and count it as a breaker failure.
        const stallMs = appConfig.catalogScan.batchStallMs;
        const startedAtMs = row.currentBatchStartedAt ? row.currentBatchStartedAt.getTime() : null;
        const stalled = stallMs > 0 && startedAtMs != null && Date.now() - startedAtMs > stallMs;
        if (!stalled) {
          await this.enqueueCoordinatorTick(appConfig.catalogScan.pollIntervalMs);
          return;
        }
        logger.warn(
          `Catalog batch at rank ${row.currentBatchStart} stalled for >${Math.round(stallMs / 60000)}m; force-terminating and counting as failure`,
          { service: 'catalogScanService' }
        );
        if (await this.applyBatchOutcomeAndMaybePause(row, seriesIds, archivedIds, { treatNonTerminalAsFailure: true })) return;
      } else {
        if (await this.applyBatchOutcomeAndMaybePause(row, seriesIds, archivedIds, {})) return;
      }

      const stats = mergeStats(parseStats(row.stats), { batchesCompleted: 1 });
      await db.update(catalogScanState).set({ stats, updatedAt: new Date() }).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID));
      await this.clearActiveBatch();

      if (row.status === 'stopping') {
        await this.finishRun('idle', false);
        return;
      }

      if (row.nextRank > row.totalCatalogCount) {
        await this.finishRun('completed', true);
        return;
      }

      row = await this.loadRow();
      if (!row || row.status !== 'running') return;
    } else if (row.status === 'stopping') {
      await this.finishRun('idle', false);
      return;
    }

    if (row.status !== 'running') return;

    if (row.nextRank > row.totalCatalogCount) {
      await this.finishRun('completed', true);
      return;
    }

    if (await this.isBackpressureActive()) {
      logger.info('Catalog scan tick deferred: mangaChapterImportQueue backpressure', { service: 'catalogScanService' });
      await this.enqueueCoordinatorTick(appConfig.catalogScan.pollIntervalMs);
      return;
    }

    const batchStart = row.nextRank;
    const batchEnd = batchStart + row.batchSize - 1;
    const result = await mangaOrchestratorService.enqueueRankedChapterScans({
      start: batchStart,
      end: batchEnd,
      skipWithChapters: row.skipWithChapters,
      type: row.type ?? undefined,
      autoSelectSource: row.autoSelectSource,
      useArchive: row.useArchive,
      jobIdPrefix: 'catalog',
    });

    const stats = mergeStats(parseStats(row.stats), {
      queued: result.queued,
      archived: result.archived,
      skippedIgnored: result.skippedIgnored,
      skippedWithChapters: result.skippedWithChapters,
      sourcesSelected: result.sourcesSelected,
      sourcesAlreadySet: result.sourcesAlreadySet,
      sourcesNotFound: result.sourcesNotFound,
      sourcesLowScore: result.sourcesLowScore,
    });

    const nextRank = batchEnd + 1;
    const now = new Date();

    if (result.matched === 0) {
      await db.update(catalogScanState).set({ stats, nextRank, updatedAt: now }).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID));
      await this.finishRun('completed', true);
      return;
    }

    if (result.enqueuedSeriesIds.length === 0 && result.archivedSeriesIds.length === 0) {
      const completedStats = mergeStats(stats, { batchesCompleted: 1 });
      await db.update(catalogScanState).set({ nextRank, stats: completedStats, updatedAt: now }).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID));
      row = await this.loadRow();
      if (!row) return;
      if (row.status === 'stopping') {
        await this.finishRun('idle', false);
        return;
      }
      if (nextRank > row.totalCatalogCount) {
        await this.finishRun('completed', true);
        return;
      }
      await this.enqueueCoordinatorTick(0);
      return;
    }

    await db.update(catalogScanState).set({
      nextRank,
      stats,
      currentBatchStart: batchStart,
      currentBatchEnd: Math.min(batchEnd, batchStart + result.matched - 1),
      currentBatchSeriesIds: result.enqueuedSeriesIds,
      currentBatchArchivedIds: result.archivedSeriesIds,
      currentBatchStartedAt: now,
      updatedAt: now,
    }).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID));

    await this.enqueueCoordinatorTick(appConfig.catalogScan.pollIntervalMs);
  }
}

export const catalogScanService = new CatalogScanService();
