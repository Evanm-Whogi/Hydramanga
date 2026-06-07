import { db, schema } from '@/db/index';
import { eq, and, count, countDistinct, sql, inArray, gt } from 'drizzle-orm';
import { BADGE_BY_ID, BADGE_DEFINITIONS, type EarnedBadge } from '@/config/badgeConfig';
import { isUserBanned } from '@/lib/banHelpers';
import { readingActivityService } from '@/services/readingActivityService';

export type BadgeTrigger =
  | 'chat_message'
  | 'comment'
  | 'chapter_read'
  | 'reading_time'
  | 'reading_day'
  | 'bookmark_change'
  | 'review_vote'
  | 'role_change';

class BadgeService {
  async getBadgesForUsers(userIds: string[]): Promise<Record<string, EarnedBadge[]>> {
    if (userIds.length === 0) return {};
    const rows = await db
      .select({
        userId: schema.userBadges.userId,
        badgeId: schema.userBadges.badgeId,
        earnedAt: schema.userBadges.earnedAt,
      })
      .from(schema.userBadges)
      .where(inArray(schema.userBadges.userId, userIds));

    const result: Record<string, EarnedBadge[]> = {};
    for (const row of rows) {
      const def = BADGE_BY_ID[row.badgeId];
      if (!def) continue;
      if (!result[row.userId]) result[row.userId] = [];
      result[row.userId].push({
        ...def,
        earnedAt: row.earnedAt.toISOString(),
      });
    }
    for (const uid of userIds) {
      if (!result[uid]) result[uid] = [];
    }
    return result;
  }

  async grantBadge(userId: string, badgeId: string): Promise<boolean> {
    if (!BADGE_BY_ID[badgeId]) return false;
    const inserted = await db
      .insert(schema.userBadges)
      .values({ userId, badgeId })
      .onConflictDoNothing()
      .returning({ badgeId: schema.userBadges.badgeId });
    return inserted.length > 0;
  }

  async revokeBadge(userId: string, badgeId: string): Promise<void> {
    await db
      .delete(schema.userBadges)
      .where(and(eq(schema.userBadges.userId, userId), eq(schema.userBadges.badgeId, badgeId)));
  }

  async syncRoleBadges(userId: string): Promise<void> {
    const [userRow] = await db
      .select({ role: schema.user.role, banned: schema.user.banned, banExpires: schema.user.banExpires })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    if (!userRow) return;

    const isStaff = userRow.role === 'admin' || userRow.role === 'moderator';
    if (isStaff) await this.grantBadge(userId, 'hydra_staff');
    else await this.revokeBadge(userId, 'hydra_staff');

    const banned = isUserBanned(userRow);
    if (banned) await this.grantBadge(userId, 'severed_head');
    else await this.revokeBadge(userId, 'severed_head');
  }

  async evaluateBadges(userId: string, trigger: BadgeTrigger): Promise<void> {
    await this.syncRoleBadges(userId);

    if (trigger === 'chat_message' || trigger === 'role_change') {
      const [row] = await db
        .select({ total: count() })
        .from(schema.chatMessages)
        .where(and(eq(schema.chatMessages.userId, userId), eq(schema.chatMessages.isDeleted, false)));
      if (Number(row?.total ?? 0) >= 100) await this.grantBadge(userId, 'chatterbox');
    }

    if (trigger === 'comment' || trigger === 'role_change') {
      const [distinctSeries] = await db
        .select({ total: countDistinct(schema.comments.seriesId) })
        .from(schema.comments)
        .where(eq(schema.comments.userId, userId));
      if (Number(distinctSeries?.total ?? 0) >= 100) await this.grantBadge(userId, 'chapter_chatter');

      const pioneerRows = await db.execute(sql`
        SELECT 1 FROM ${schema.comments} c
        WHERE c."userId" = ${userId}
        AND NOT EXISTS (
          SELECT 1 FROM ${schema.comments} earlier
          WHERE earlier."seriesId" = c."seriesId"
          AND (earlier."createdAt" < c."createdAt" OR (earlier."createdAt" = c."createdAt" AND earlier.id < c.id))
        )
        LIMIT 1
      `);
      if ((pioneerRows.rows?.length ?? 0) > 0) await this.grantBadge(userId, 'the_pioneer');
    }

    if (trigger === 'chapter_read' || trigger === 'role_change') {
      const [readCount] = await db
        .select({ total: count() })
        .from(schema.userChapterProgress)
        .where(and(eq(schema.userChapterProgress.userId, userId), eq(schema.userChapterProgress.isRead, true)));
      if (Number(readCount?.total ?? 0) >= 1) await this.grantBadge(userId, 'first_bite');

      const distinctSeriesRead = await db
        .select({ total: countDistinct(schema.chapters.seriesId) })
        .from(schema.userChapterProgress)
        .innerJoin(schema.chapters, eq(schema.chapters.id, schema.userChapterProgress.chapterId))
        .where(and(eq(schema.userChapterProgress.userId, userId), eq(schema.userChapterProgress.isRead, true)));
      if (Number(distinctSeriesRead[0]?.total ?? 0) >= 50) await this.grantBadge(userId, 'avid_reader');

      const [settings] = await db
        .select({ incognitoChaptersRead: schema.userSettings.incognitoChaptersRead })
        .from(schema.userSettings)
        .where(eq(schema.userSettings.userId, userId))
        .limit(1);
      if ((settings?.incognitoChaptersRead ?? 0) >= 50) await this.grantBadge(userId, 'under_the_radar');
    }

    if (trigger === 'reading_time' || trigger === 'role_change') {
      const [timeRow] = await db
        .select({ total: sql<number>`COALESCE(SUM(${schema.userReadingTime.seconds}), 0)` })
        .from(schema.userReadingTime)
        .where(eq(schema.userReadingTime.userId, userId));
      if (Number(timeRow?.total ?? 0) >= 86400) await this.grantBadge(userId, 'marathon_reader');
    }

    if (trigger === 'reading_day' || trigger === 'role_change') {
      const { currentStreak } = await readingActivityService.getStreakStats(userId);
      if (currentStreak >= 7) await this.grantBadge(userId, 'unbroken_streak');
    }

    if (trigger === 'bookmark_change' || trigger === 'role_change') {
      const [finishedCount] = await db
        .select({ total: count() })
        .from(schema.seriesBookmarks)
        .where(and(eq(schema.seriesBookmarks.userId, userId), eq(schema.seriesBookmarks.status, 'completed')));
      if (Number(finishedCount?.total ?? 0) >= 25) await this.grantBadge(userId, 'completionist');
    }

    if (trigger === 'review_vote' || trigger === 'role_change') {
      const upvotedReviews = await db
        .select({ reviewId: schema.reviews.id })
        .from(schema.reviews)
        .innerJoin(schema.reviewVotes, eq(schema.reviewVotes.reviewId, schema.reviews.id))
        .where(and(eq(schema.reviews.userId, userId), eq(schema.reviewVotes.type, 'like')))
        .groupBy(schema.reviews.id)
        .having(gt(count(schema.reviewVotes.reviewId), 0));
      if (upvotedReviews.length >= 5) await this.grantBadge(userId, 'hydras_voice');
    }
  }

  evaluateBadgesAsync(userId: string, trigger: BadgeTrigger): void {
    void this.evaluateBadges(userId, trigger).catch(() => undefined);
  }

  async evaluateAllBadgesForUser(userId: string): Promise<void> {
    await this.evaluateBadges(userId, 'role_change');
  }

  async getAllBadgeDefinitions(): Promise<typeof BADGE_DEFINITIONS> {
    return BADGE_DEFINITIONS;
  }
}

export const badgeService = new BadgeService();
