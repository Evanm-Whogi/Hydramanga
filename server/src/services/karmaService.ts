import { db, schema } from '@/db/index';
import { eq, sql, count, inArray, and } from 'drizzle-orm';
import logger from '@/services/loggerService';
import { KARMA_AMOUNTS, LEVEL_THRESHOLDS, LEVEL_NAMES, type KarmaAction } from '@/config/karmaConfig';
import { cacheService } from '@/services/cacheService';

const BACKFILL_KEY = 'migration_backfill';

class KarmaService {
  calculateLevel(totalKarma: number) {
    let level = 1;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      if (totalKarma >= LEVEL_THRESHOLDS[i]) level = i + 1;
      else break;
    }

    const maxLevel = LEVEL_THRESHOLDS.length;
    if (level >= maxLevel && totalKarma >= LEVEL_THRESHOLDS[maxLevel - 1]) {
      return {
        level: maxLevel,
        levelName: LEVEL_NAMES[maxLevel - 1],
        currentLevelKarma: totalKarma - LEVEL_THRESHOLDS[maxLevel - 1],
        karmaForNextLevel: 0,
        karmaToNextLevel: 0,
        progressToNextLevel: 100,
      };
    }

    const currentLevelIndex = level - 1;
    const nextLevelIndex = currentLevelIndex + 1;
    const currentBase = LEVEL_THRESHOLDS[currentLevelIndex];
    const nextBase = LEVEL_THRESHOLDS[nextLevelIndex];
    const karmaForNextLevel = nextBase - currentBase;
    const currentLevelKarma = totalKarma - currentBase;
    const karmaToNextLevel = Math.max(nextBase - totalKarma, 0);
    const progressToNextLevel =
      karmaForNextLevel > 0
        ? Math.min(100, Math.max(0, (currentLevelKarma / karmaForNextLevel) * 100))
        : 0;

    return {
      level,
      levelName: LEVEL_NAMES[currentLevelIndex],
      currentLevelKarma,
      karmaForNextLevel,
      karmaToNextLevel,
      progressToNextLevel,
    };
  }

  async award(params: {
    userId: string;
    action: KarmaAction;
    sourceType?: string;
    sourceId?: string;
    idempotencyKey: string;
    amount?: number;
  }): Promise<boolean> {
    const amount = params.amount ?? KARMA_AMOUNTS[params.action];
    if (amount === 0) return false;

    try {
      await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(schema.karmaTransactions)
          .values({
            userId: params.userId,
            action: params.action,
            amount,
            sourceType: params.sourceType ?? params.action,
            sourceId: params.sourceId ?? null,
            idempotencyKey: params.idempotencyKey,
          })
          .onConflictDoNothing({ target: schema.karmaTransactions.idempotencyKey })
          .returning({ id: schema.karmaTransactions.id });

        if (inserted.length === 0) return;

        await tx
          .update(schema.user)
          .set({
            karmaTotal: sql`${schema.user.karmaTotal} + ${amount}`,
            updatedAt: new Date(),
          })
          .where(eq(schema.user.id, params.userId));
      });

      await cacheService.invalidatePattern(`user:${params.userId}:*`);
      return true;
    } catch (error) {
      logger.error(`Karma award failed: ${error}`, { service: 'karmaService' });
      return false;
    }
  }

  async reverse(params: {
    userId: string;
    action: KarmaAction;
    sourceType: string;
    sourceId: string;
    originalIdempotencyKey: string;
  }): Promise<void> {
    const reversalKey = `reversal:${params.originalIdempotencyKey}`;
    const amount = -(KARMA_AMOUNTS[params.action]);

    try {
      await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(schema.karmaTransactions)
          .values({
            userId: params.userId,
            action: `${params.action}_reversal`,
            amount,
            sourceType: params.sourceType,
            sourceId: params.sourceId,
            idempotencyKey: reversalKey,
          })
          .onConflictDoNothing({ target: schema.karmaTransactions.idempotencyKey })
          .returning({ id: schema.karmaTransactions.id });

        if (inserted.length === 0) return;

        await tx
          .update(schema.user)
          .set({
            karmaTotal: sql`GREATEST(0, ${schema.user.karmaTotal} + ${amount})`,
            updatedAt: new Date(),
          })
          .where(eq(schema.user.id, params.userId));
      });

      await cacheService.invalidatePattern(`user:${params.userId}:*`);
    } catch (error) {
      logger.error(`Karma reversal failed: ${error}`, { service: 'karmaService' });
    }
  }

  async getKarmaSummary(userId: string) {
    const [userRow] = await db
      .select({ karmaTotal: schema.user.karmaTotal })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    const totalKarma = userRow?.karmaTotal ?? 0;
    const levelInfo = this.calculateLevel(totalKarma);

    const breakdownRows = await db
      .select({
        action: schema.karmaTransactions.action,
        total: sql<number>`COALESCE(SUM(${schema.karmaTransactions.amount}), 0)`.mapWith(Number),
      })
      .from(schema.karmaTransactions)
      .where(and(eq(schema.karmaTransactions.userId, userId), sql`${schema.karmaTransactions.amount} > 0`))
      .groupBy(schema.karmaTransactions.action);

    const breakdown: Record<string, number> = {};
    for (const row of breakdownRows) {
      if (!row.action.endsWith('_reversal')) {
        breakdown[row.action] = (breakdown[row.action] ?? 0) + row.total;
      }
    }

    return {
      totalKarma,
      ...levelInfo,
      breakdown,
    };
  }

  async getKarmaSummaries(userIds: string[]): Promise<
    Record<string, { totalKarma: number; level: number; levelName: string }>
  > {
    if (userIds.length === 0) return {};

    const rows = await db
      .select({ id: schema.user.id, karmaTotal: schema.user.karmaTotal })
      .from(schema.user)
      .where(inArray(schema.user.id, userIds));

    const result: Record<string, { totalKarma: number; level: number; levelName: string }> = {};
    for (const row of rows) {
      const totalKarma = row.karmaTotal ?? 0;
      const levelInfo = this.calculateLevel(totalKarma);
      result[row.id] = {
        totalKarma,
        level: levelInfo.level,
        levelName: levelInfo.levelName,
      };
    }
    return result;
  }

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

    logger.info('Running karma backfill from historical activity', { service: 'karmaService' });

    const users = await db.select({ id: schema.user.id }).from(schema.user);

    for (const { id: userId } of users) {
      const [commentCount] = await db
        .select({ count: count() })
        .from(schema.comments)
        .where(eq(schema.comments.userId, userId));
      const [reviewCount] = await db
        .select({ count: count() })
        .from(schema.reviews)
        .where(eq(schema.reviews.userId, userId));
      const [bookmarkCount] = await db
        .select({ count: count() })
        .from(schema.seriesBookmarks)
        .where(eq(schema.seriesBookmarks.userId, userId));
      const [chapterReadCount] = await db
        .select({ count: count() })
        .from(schema.userChapterProgress)
        .where(
          and(eq(schema.userChapterProgress.userId, userId), eq(schema.userChapterProgress.isRead, true))
        );

      const total =
        Number(commentCount?.count ?? 0) * KARMA_AMOUNTS.comment +
        Number(reviewCount?.count ?? 0) * KARMA_AMOUNTS.review +
        Number(bookmarkCount?.count ?? 0) * KARMA_AMOUNTS.bookmark_add +
        Number(chapterReadCount?.count ?? 0) * KARMA_AMOUNTS.chapter_read;

      if (total <= 0) continue;

      await db.transaction(async (tx) => {
        await tx.insert(schema.karmaTransactions).values({
          userId,
          action: BACKFILL_KEY,
          amount: total,
          sourceType: 'system',
          sourceId: null,
          idempotencyKey: `${BACKFILL_KEY}:${userId}`,
        });
        await tx
          .update(schema.user)
          .set({ karmaTotal: sql`${schema.user.karmaTotal} + ${total}` })
          .where(eq(schema.user.id, userId));
      });
    }

    await db.insert(schema.karmaTransactions).values({
      userId: users[0]?.id ?? 'system',
      action: BACKFILL_KEY,
      amount: 0,
      sourceType: 'system',
      sourceId: null,
      idempotencyKey: `${BACKFILL_KEY}:global`,
    });

    logger.info('Karma backfill complete', { service: 'karmaService' });
  }
}

export const karmaService = new KarmaService();
