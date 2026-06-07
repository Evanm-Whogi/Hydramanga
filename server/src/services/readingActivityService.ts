import { db, schema } from '@/db/index';
import { eq, asc, inArray } from 'drizzle-orm';
import logger from '@/services/loggerService';
import { badgeService } from '@/services/badgeService';

const BACKFILL_KEY = 'reading_days_backfill';

function toDateOnly(d: Date): Date {
  const s = d.toISOString().slice(0, 10);
  return new Date(`${s}T00:00:00.000Z`);
}

class ReadingActivityService {
  private backfillPromise: Promise<void> | null = null;

  async ensureBackfilled(): Promise<void> {
    if (!this.backfillPromise) {
      this.backfillPromise = this.runBackfill();
    }
    return this.backfillPromise;
  }

  private async runBackfill(): Promise<void> {
    const existing = await db
      .select({ id: schema.karmaTransactions.id })
      .from(schema.karmaTransactions)
      .where(eq(schema.karmaTransactions.idempotencyKey, `${BACKFILL_KEY}:global`))
      .limit(1);

    if (existing.length > 0) return;

    logger.info('Running reading days backfill from chapter progress', { service: 'readingActivityService' });

    const rows = await db
      .select({
        userId: schema.userChapterProgress.userId,
        updatedAt: schema.userChapterProgress.updatedAt,
      })
      .from(schema.userChapterProgress)
      .where(eq(schema.userChapterProgress.isRead, true as const));

    for (const row of rows) {
      const day = toDateOnly(new Date(row.updatedAt));
      await db
        .insert(schema.userReadingDays)
        .values({ userId: row.userId, activityDate: day, source: 'chapter_read' })
        .onConflictDoNothing();
    }

    const [firstUser] = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
    await db.insert(schema.karmaTransactions).values({
      userId: firstUser?.id ?? 'system',
      action: BACKFILL_KEY,
      amount: 0,
      sourceType: 'system',
      sourceId: null,
      idempotencyKey: `${BACKFILL_KEY}:global`,
    });

    logger.info('Reading days backfill complete', { service: 'readingActivityService' });
  }

  async recordReadingDay(userId: string, source: 'chapter_read' | 'reading_time' = 'chapter_read'): Promise<void> {
    const today = toDateOnly(new Date());
    try {
      await db
        .insert(schema.userReadingDays)
        .values({
          userId,
          activityDate: today,
          source,
        })
        .onConflictDoNothing();
      badgeService.evaluateBadgesAsync(userId, 'reading_day');
    } catch (error) {
      logger.error(`Failed to record reading day: ${error}`, { service: 'readingActivityService' });
    }
  }

  computeLongestStreak(dates: Date[]): number {
    if (dates.length === 0) return 0;

    let longest = 1;
    let current = 1;
    let prev: number | null = null;

    for (const row of dates) {
      const dayNum = Math.floor(new Date(row).getTime() / (1000 * 60 * 60 * 24));
      if (prev === null) {
        current = 1;
      } else if (dayNum === prev + 1) {
        current += 1;
      } else if (dayNum !== prev) {
        current = 1;
      }
      if (current > longest) longest = current;
      prev = dayNum;
    }

    return longest;
  }

  computeCurrentStreak(dates: Date[]): number {
    if (dates.length === 0) return 0;

    const today = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const sorted = [...dates]
      .map((d) => Math.floor(new Date(d).getTime() / (1000 * 60 * 60 * 24)))
      .sort((a, b) => b - a);

    const latest = sorted[0];
    if (latest < today - 1) return 0;

    let streak = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] - 1) streak += 1;
      else if (sorted[i] !== sorted[i - 1]) break;
    }
    return streak;
  }

  async getStreakStats(userId: string) {
    const rows = await db
      .select({ activityDate: schema.userReadingDays.activityDate })
      .from(schema.userReadingDays)
      .where(eq(schema.userReadingDays.userId, userId))
      .orderBy(asc(schema.userReadingDays.activityDate));

    const dates = rows.map((r) => new Date(r.activityDate as unknown as string));
    return {
      longestStreak: this.computeLongestStreak(dates),
      currentStreak: this.computeCurrentStreak(dates),
    };
  }

  async getLongestStreaksForUsers(userIds: string[]): Promise<Record<string, number>> {
    if (userIds.length === 0) return {};

    const rows = await db
      .select({
        userId: schema.userReadingDays.userId,
        activityDate: schema.userReadingDays.activityDate,
      })
      .from(schema.userReadingDays)
      .where(inArray(schema.userReadingDays.userId, userIds))
      .orderBy(asc(schema.userReadingDays.activityDate));

    const byUser = new Map<string, Date[]>();
    for (const row of rows) {
      const list = byUser.get(row.userId) ?? [];
      list.push(new Date(row.activityDate as unknown as string));
      byUser.set(row.userId, list);
    }

    const result: Record<string, number> = {};
    for (const userId of userIds) {
      result[userId] = this.computeLongestStreak(byUser.get(userId) ?? []);
    }
    return result;
  }
}

export const readingActivityService = new ReadingActivityService();
