import { db, schema } from '@/db/index';
import { sql, count, gte } from 'drizzle-orm';
import { queueService } from '@/services/queueService';
import { appConfig } from '@/config/appConfig';

const QUEUE_NAMES = Object.keys(appConfig.queues) as (keyof typeof appConfig.queues)[];

export interface AdminOverviewStats {
  users: {
    total: number;
    admins: number;
    newLast7Days: number;
    newLast30Days: number;
  };
  manga: {
    totalSeries: number;
    seriesWithChapters: number;
    activeImports: number;
    failedImports: number;
  };
  views: {
    totalViews: number;
  };
  queues: {
    waiting: number;
    active: number;
    failed: number;
    delayed: number;
  };
}

export interface TimeseriesPoint {
  date: string;
  count: number;
}

export interface AdminTimeseries {
  days: number;
  userSignups: TimeseriesPoint[];
  mangaViews: TimeseriesPoint[];
  importCompletions: TimeseriesPoint[];
}

class AdminStatsService {
  async getOverviewStats(): Promise<AdminOverviewStats> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [userCounts, seriesCounts, importCounts, viewTotals] = await Promise.all([
      db
        .select({
          total: count(),
          admins: sql<number>`count(*) filter (where ${schema.user.role} = 'admin')`,
          newLast7Days: sql<number>`count(*) filter (where ${schema.user.createdAt} >= ${sevenDaysAgo})`,
          newLast30Days: sql<number>`count(*) filter (where ${schema.user.createdAt} >= ${thirtyDaysAgo})`,
        })
        .from(schema.user),
      Promise.all([
        db.select({ total: count() }).from(schema.series),
        db
          .select({
            withChapters: sql<number>`count(distinct ${schema.chapters.seriesId})`,
          })
          .from(schema.chapters),
      ]),
      db
        .select({
          active: sql<number>`count(*) filter (where ${schema.mangaImportProgress.status} in ('scanning', 'downloading'))`,
          failed: sql<number>`count(*) filter (where ${schema.mangaImportProgress.status} = 'failed')`,
        })
        .from(schema.mangaImportProgress),
      db
        .select({
          totalViews: sql<number>`coalesce(sum(${schema.mangaViewStats.totalViews}), 0)`,
        })
        .from(schema.mangaViewStats),
    ]);

    const queueTotals = await this.getQueueTotals();

    const users = userCounts[0];
    const [seriesTotal, seriesWithChapters] = seriesCounts;
    const imports = importCounts[0];
    const views = viewTotals[0];

    return {
      users: {
        total: Number(users?.total ?? 0),
        admins: Number(users?.admins ?? 0),
        newLast7Days: Number(users?.newLast7Days ?? 0),
        newLast30Days: Number(users?.newLast30Days ?? 0),
      },
      manga: {
        totalSeries: Number(seriesTotal[0]?.total ?? 0),
        seriesWithChapters: Number(seriesWithChapters[0]?.withChapters ?? 0),
        activeImports: Number(imports?.active ?? 0),
        failedImports: Number(imports?.failed ?? 0),
      },
      views: {
        totalViews: Number(views?.totalViews ?? 0),
      },
      queues: queueTotals,
    };
  }

  private emptyQueueTotals() {
    return { waiting: 0, active: 0, failed: 0, delayed: 0 };
  }

  private async getQueueTotals() {
    const empty = this.emptyQueueTotals();

    try {
      return await Promise.race([
        this.fetchQueueTotals(),
        new Promise<typeof empty>((resolve) => setTimeout(() => resolve(empty), 4000)),
      ]);
    } catch {
      return empty;
    }
  }

  private async fetchQueueTotals() {
    let waiting = 0;
    let active = 0;
    let failed = 0;
    let delayed = 0;

    await Promise.all(
      QUEUE_NAMES.map(async (name) => {
        try {
          const status = await Promise.race([
            queueService.getQueueStatus(name),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('queue status timeout')), 3000)
            ),
          ]);
          waiting += status.waiting;
          active += status.active;
          failed += status.failed;
          delayed += status.delayed;
        } catch {
          // Redis unreachable or slow — skip this queue
        }
      })
    );

    return { waiting, active, failed, delayed };
  }

  async getTimeseries(days: number): Promise<AdminTimeseries> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    const [userSignups, mangaViews, importCompletions] = await Promise.all([
      db
        .select({
          date: sql<string>`date_trunc('day', ${schema.user.createdAt})::date`.as('date'),
          count: count(),
        })
        .from(schema.user)
        .where(gte(schema.user.createdAt, since))
        .groupBy(sql`date_trunc('day', ${schema.user.createdAt})::date`)
        .orderBy(sql`date_trunc('day', ${schema.user.createdAt})::date`),
      db
        .select({
          date: sql<string>`date_trunc('day', ${schema.mangaViews.viewedAt})::date`.as('date'),
          count: count(),
        })
        .from(schema.mangaViews)
        .where(gte(schema.mangaViews.viewedAt, since))
        .groupBy(sql`date_trunc('day', ${schema.mangaViews.viewedAt})::date`)
        .orderBy(sql`date_trunc('day', ${schema.mangaViews.viewedAt})::date`),
      db
        .select({
          date: sql<string>`date_trunc('day', ${schema.mangaImportProgress.completedAt})::date`.as('date'),
          count: count(),
        })
        .from(schema.mangaImportProgress)
        .where(
          sql`${schema.mangaImportProgress.completedAt} is not null and ${schema.mangaImportProgress.completedAt} >= ${since}`
        )
        .groupBy(sql`date_trunc('day', ${schema.mangaImportProgress.completedAt})::date`)
        .orderBy(sql`date_trunc('day', ${schema.mangaImportProgress.completedAt})::date`),
    ]);

    return {
      days,
      userSignups: this.normalizePoints(userSignups, days),
      mangaViews: this.normalizePoints(mangaViews, days),
      importCompletions: this.normalizePoints(importCompletions, days),
    };
  }

  private normalizePoints(rows: { date: string | Date; count: number | string | bigint }[], days: number): TimeseriesPoint[] {
    const byDate = new Map<string, number>();
    for (const row of rows) {
      const d = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10);
      byDate.set(d, Number(row.count));
    }

    const points: TimeseriesPoint[] = [];
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      points.push({ date: key, count: byDate.get(key) ?? 0 });
    }

    return points;
  }
}

export const adminStatsService = new AdminStatsService();
