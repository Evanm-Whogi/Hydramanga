import { db } from '@/db';
import { acquisitionJobs, catalogScanState } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import logger from '@/services/loggerService';
import { queueService } from '@/services/queueService';
import { mangaOrchestratorService } from '@/services/mangaOrchestratorService';
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
    return scanStatus !== 'scanning' && scanStatus !== 'downloading' && scanStatus !== 'queued';
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
        await this.enqueueCoordinatorTick(appConfig.catalogScan.pollIntervalMs);
        return;
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
      updatedAt: now,
    }).where(eq(catalogScanState.id, CATALOG_SCAN_STATE_ID));

    await this.enqueueCoordinatorTick(appConfig.catalogScan.pollIntervalMs);
  }
}

export const catalogScanService = new CatalogScanService();
