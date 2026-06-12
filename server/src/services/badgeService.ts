import { db, schema } from '@/db/index';
import { eq, and, count, countDistinct, sql, inArray, gt, asc } from 'drizzle-orm';
import { BADGE_BY_ID, BADGE_DEFINITIONS, CHAPTER_MILESTONE_BADGES, CHAPTER_MILESTONE_BADGE_IDS, ORIGINAL_LEGACY_BADGES, ORIGINAL_LEGACY_BADGE_IDS, collapseDisplayBadges, getHighestChapterMilestoneBadgeId, getMostExclusiveOriginalLegacyBadgeId, isChapterMilestoneBadge, isOriginalLegacyBadge, type EarnedBadge } from '@/config/badgeConfig';
import { isUserBanned } from '@/lib/banHelpers';
import { isSeriesHiddenByUserNsfw } from '@/config/contentFilter';
import { isBetaVersion } from '@/config/versionConfig';
import { readingActivityService } from '@/services/readingActivityService';

export type BadgeTrigger =
  | 'chat_message'
  | 'comment'
  | 'chapter_read'
  | 'reading_time'
  | 'reading_day'
  | 'bookmark_change'
  | 'review_vote'
  | 'review_create'
  | 'import_request_complete'
  | 'board_post'
  | 'board_reply'
  | 'follow'
  | 'profile_update'
  | 'list_save'
  | 'manga_view'
  | 'signup'
  | 'role_change'
  | 'admin_set';

const DEFAULT_AVATAR = '/default-avatar.jpg';

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
      else result[uid] = collapseDisplayBadges(result[uid]);
    }
    return result;
  }

  private async syncChapterMilestoneBadges(userId: string, readCount: number): Promise<void> {
    const autoHighestId = getHighestChapterMilestoneBadgeId(
      CHAPTER_MILESTONE_BADGES.filter((milestone) => readCount >= milestone.threshold).map((milestone) => milestone.id),
    );
    const existingRows = await db
      .select({ badgeId: schema.userBadges.badgeId })
      .from(schema.userBadges)
      .where(and(eq(schema.userBadges.userId, userId), inArray(schema.userBadges.badgeId, CHAPTER_MILESTONE_BADGE_IDS)));
    const existingHighestId = getHighestChapterMilestoneBadgeId(existingRows.map((row) => row.badgeId));
    const highestId = [autoHighestId, existingHighestId].reduce<string | null>((best, badgeId) => {
      if (!badgeId) return best;
      if (!best) return badgeId;
      return CHAPTER_MILESTONE_BADGE_IDS.indexOf(badgeId) > CHAPTER_MILESTONE_BADGE_IDS.indexOf(best) ? badgeId : best;
    }, null);
    for (const milestone of CHAPTER_MILESTONE_BADGES) {
      if (milestone.id === highestId) await this.grantBadge(userId, milestone.id);
      else await this.revokeBadge(userId, milestone.id);
    }
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

  async revokeDeprecatedBadges(): Promise<number> {
    const deleted = await db
      .delete(schema.userBadges)
      .where(eq(schema.userBadges.badgeId, 'unbroken_streak'))
      .returning({ userId: schema.userBadges.userId });
    return deleted.length;
  }

  async setUserBadges(userId: string, badgeIds: string[]): Promise<void> {
    let validIds = [...new Set(badgeIds.filter((id) => BADGE_BY_ID[id]))];
    const highestSelectedMilestoneId = getHighestChapterMilestoneBadgeId(validIds);
    if (highestSelectedMilestoneId) {
      validIds = validIds.filter((id) => !isChapterMilestoneBadge(id) || id === highestSelectedMilestoneId);
    }
    const mostExclusiveOriginalLegacyId = getMostExclusiveOriginalLegacyBadgeId(validIds);
    if (mostExclusiveOriginalLegacyId) {
      validIds = validIds.filter((id) => !isOriginalLegacyBadge(id) || id === mostExclusiveOriginalLegacyId);
    }
    const existing = await db
      .select({ badgeId: schema.userBadges.badgeId })
      .from(schema.userBadges)
      .where(eq(schema.userBadges.userId, userId));
    const existingSet = new Set(existing.map((r) => r.badgeId));
    const targetSet = new Set(validIds);

    for (const badgeId of validIds) {
      if (!existingSet.has(badgeId)) await this.grantBadge(userId, badgeId);
    }
    for (const row of existing) {
      if (!targetSet.has(row.badgeId)) await this.revokeBadge(userId, row.badgeId);
    }
    await this.syncRoleBadges(userId);
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

  async syncHydraMasterBadge(): Promise<void> {
    const topRows = await db.execute(sql`
      SELECT user_id AS "userId", COUNT(*)::int AS total
      FROM ${schema.userChapterProgress}
      WHERE is_read = true
      GROUP BY user_id
      ORDER BY total DESC
      LIMIT 1
    `);
    const top = topRows.rows?.[0] as { userId?: string; total?: number } | undefined;
    const topUserId = top?.userId;
    const topCount = Number(top?.total ?? 0);
    if (!topUserId || topCount <= 0) return;

    const currentHolders = await db
      .select({ userId: schema.userBadges.userId })
      .from(schema.userBadges)
      .where(eq(schema.userBadges.badgeId, 'hydra_master'));

    for (const holder of currentHolders) {
      if (holder.userId !== topUserId) await this.revokeBadge(holder.userId, 'hydra_master');
    }
    await this.grantBadge(topUserId, 'hydra_master');
  }

  async backfillLegacyBadges(): Promise<{ firstGeneration: number; original100: number; original1000: number }> {
    let firstGeneration = 0;
    let original100 = 0;
    let original1000 = 0;

    const users = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .orderBy(asc(schema.user.createdAt));

    if (isBetaVersion()) {
      for (const user of users) {
        if (await this.grantBadge(user.id, 'first_generation')) firstGeneration += 1;
      }
    }

    for (let i = 0; i < users.length; i++) {
      const granted = await this.syncOriginalLegacyBadges(users[i].id);
      if (granted === 'original_100') original100 += 1;
      if (granted === 'original_1000') original1000 += 1;
    }

    return { firstGeneration, original100, original1000 };
  }

  async evaluateSignupBadges(userId: string): Promise<void> {
    await this.syncOriginalLegacyBadges(userId);
    if (isBetaVersion()) await this.grantBadge(userId, 'first_generation');
  }

  private async getUserJoinRank(userId: string): Promise<number | null> {
    const [userRow] = await db
      .select({ createdAt: schema.user.createdAt })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    if (!userRow) return null;
    const [rankRow] = await db
      .select({ rank: sql<number>`count(*)::int` })
      .from(schema.user)
      .where(sql`${schema.user.createdAt} <= ${userRow.createdAt}`);
    const rank = Number(rankRow?.rank ?? 0);
    return rank > 0 ? rank : null;
  }

  private getAutoOriginalLegacyBadgeId(joinRank: number | null): string | null {
    if (joinRank === null) return null;
    if (joinRank <= 100) return 'original_100';
    if (joinRank <= 1000) return 'original_1000';
    return null;
  }

  private async syncOriginalLegacyBadges(userId: string): Promise<string | null> {
    const joinRank = await this.getUserJoinRank(userId);
    const autoId = this.getAutoOriginalLegacyBadgeId(joinRank);
    const existingRows = await db
      .select({ badgeId: schema.userBadges.badgeId })
      .from(schema.userBadges)
      .where(and(eq(schema.userBadges.userId, userId), inArray(schema.userBadges.badgeId, ORIGINAL_LEGACY_BADGE_IDS)));
    const existingId = getMostExclusiveOriginalLegacyBadgeId(existingRows.map((row) => row.badgeId));
    const displayId = [autoId, existingId].reduce<string | null>((best, badgeId) => {
      if (!badgeId) return best;
      if (!best) return badgeId;
      return ORIGINAL_LEGACY_BADGE_IDS.indexOf(badgeId) < ORIGINAL_LEGACY_BADGE_IDS.indexOf(best) ? badgeId : best;
    }, null);
    for (const badge of ORIGINAL_LEGACY_BADGES) {
      if (badge.id === displayId) await this.grantBadge(userId, badge.id);
      else await this.revokeBadge(userId, badge.id);
    }
    return displayId;
  }

  private async getChapterReadCount(userId: string): Promise<number> {
    const [row] = await db
      .select({ total: count() })
      .from(schema.userChapterProgress)
      .where(and(eq(schema.userChapterProgress.userId, userId), eq(schema.userChapterProgress.isRead, true)));
    return Number(row?.total ?? 0);
  }

  private async evaluateReadingBadges(userId: string, trigger: BadgeTrigger): Promise<void> {
    if (trigger === 'chapter_read' || trigger === 'role_change') {
      const readCount = await this.getChapterReadCount(userId);
      if (readCount >= 1) await this.grantBadge(userId, 'first_bite');
      await this.syncChapterMilestoneBadges(userId, readCount);

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

      const nightOwlRows = await db.execute(sql`
        SELECT COUNT(DISTINCT DATE(${schema.userChapterProgress.updatedAt} AT TIME ZONE 'UTC')) AS total
        FROM ${schema.userChapterProgress}
        WHERE ${schema.userChapterProgress.userId} = ${userId}
          AND ${schema.userChapterProgress.isRead} = true
          AND EXTRACT(HOUR FROM ${schema.userChapterProgress.updatedAt} AT TIME ZONE 'UTC') >= 0
          AND EXTRACT(HOUR FROM ${schema.userChapterProgress.updatedAt} AT TIME ZONE 'UTC') < 5
      `);
      if (Number((nightOwlRows.rows?.[0] as { total?: number })?.total ?? 0) >= 7) {
        await this.grantBadge(userId, 'night_owl');
      }

      const ancientRows = await db.execute(sql`
        SELECT COUNT(DISTINCT ${schema.chapters.seriesId}) AS total
        FROM ${schema.userChapterProgress}
        INNER JOIN ${schema.chapters} ON ${schema.chapters.id} = ${schema.userChapterProgress.chapterId}
        INNER JOIN ${schema.series} ON ${schema.series.id} = ${schema.chapters.seriesId}
        WHERE ${schema.userChapterProgress.userId} = ${userId}
          AND ${schema.userChapterProgress.isRead} = true
          AND ${schema.series.year} IS NOT NULL
          AND ${schema.series.year} < 2000
      `);
      if (Number((ancientRows.rows?.[0] as { total?: number })?.total ?? 0) >= 25) {
        await this.grantBadge(userId, 'ancient_scrolls');
      }

      const responderRows = await db.execute(sql`
        SELECT COUNT(DISTINCT ${schema.userChapterProgress.chapterId}) AS total
        FROM ${schema.userChapterProgress}
        INNER JOIN ${schema.chapters} ON ${schema.chapters.id} = ${schema.userChapterProgress.chapterId}
        WHERE ${schema.userChapterProgress.userId} = ${userId}
          AND ${schema.userChapterProgress.isRead} = true
          AND ${schema.userChapterProgress.updatedAt} <= ${schema.chapters.createdAt} + INTERVAL '1 hour'
      `);
      if (Number((responderRows.rows?.[0] as { total?: number })?.total ?? 0) >= 25) {
        await this.grantBadge(userId, 'first_responder');
      }

      await this.evaluateGenreAndWorldBadges(userId);
      await this.syncHydraMasterBadge();
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
      if (currentStreak >= 14) await this.grantBadge(userId, 'daily_ritual');
      if (currentStreak >= 30) await this.grantBadge(userId, 'hydra_disciple');
      if (currentStreak >= 100) await this.grantBadge(userId, 'hydra_champion');
    }

    if (trigger === 'bookmark_change' || trigger === 'role_change') {
      const [finishedCount] = await db
        .select({ total: count() })
        .from(schema.seriesBookmarks)
        .where(and(eq(schema.seriesBookmarks.userId, userId), eq(schema.seriesBookmarks.status, 'completed')));
      if (Number(finishedCount?.total ?? 0) >= 25) await this.grantBadge(userId, 'completionist');

      const [bookmarkCount] = await db
        .select({ total: count() })
        .from(schema.seriesBookmarks)
        .where(eq(schema.seriesBookmarks.userId, userId));
      if (Number(bookmarkCount?.total ?? 0) >= 500) await this.grantBadge(userId, 'collector');

      await this.evaluateCutOffOneHead(userId);
    }
  }

  private async evaluateCutOffOneHead(userId: string): Promise<void> {
    const rows = await db.execute(sql`
      SELECT 1
      FROM ${schema.seriesBookmarks} sb
      INNER JOIN ${schema.userReadingProgress} urp
        ON urp.user_id = sb.user_id
        AND urp.series_id <> sb.series_id
      WHERE sb.user_id = ${userId}
        AND sb.status = 'completed'
        AND DATE(sb.updated_at AT TIME ZONE 'UTC') = DATE(urp.updated_at AT TIME ZONE 'UTC')
      LIMIT 1
    `);
    if ((rows.rows?.length ?? 0) > 0) await this.grantBadge(userId, 'cut_off_one_head');
  }

  private async evaluateGenreAndWorldBadges(userId: string): Promise<void> {
    const genreRows = await db.execute(sql`
      SELECT COUNT(DISTINCT LOWER(TRIM(genre))) AS total
      FROM ${schema.userChapterProgress} ucp
      INNER JOIN ${schema.chapters} c ON c.id = ucp.chapter_id
      INNER JOIN ${schema.series} s ON s.id = c.series_id
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(s.genres, '[]'::jsonb)) AS genre
      WHERE ucp.user_id = ${userId} AND ucp.is_read = true
    `);
    if (Number((genreRows.rows?.[0] as { total?: number })?.total ?? 0) >= 15) {
      await this.grantBadge(userId, 'genre_explorer');
    }

    const typeRows = await db.execute(sql`
      SELECT LOWER(COALESCE(s.type, '')) AS type, COUNT(DISTINCT s.id) AS total
      FROM ${schema.userChapterProgress} ucp
      INNER JOIN ${schema.chapters} c ON c.id = ucp.chapter_id
      INNER JOIN ${schema.series} s ON s.id = c.series_id
      WHERE ucp.user_id = ${userId} AND ucp.is_read = true
      GROUP BY LOWER(COALESCE(s.type, ''))
    `);
    const typeMap = new Map((typeRows.rows as { type: string; total: number }[]).map((r) => [r.type, Number(r.total)]));
    if ((typeMap.get('manga') ?? 0) >= 25 && (typeMap.get('manhwa') ?? 0) >= 25 && (typeMap.get('manhua') ?? 0) >= 25) {
      await this.grantBadge(userId, 'world_traveler');
    }
  }

  private async evaluateCommunityBadges(userId: string, trigger: BadgeTrigger): Promise<void> {
    if (trigger === 'chat_message' || trigger === 'role_change') {
      const [row] = await db
        .select({ total: count() })
        .from(schema.chatMessages)
        .where(and(eq(schema.chatMessages.userId, userId), eq(schema.chatMessages.isDeleted, false)));
      if (Number(row?.total ?? 0) >= 100) await this.grantBadge(userId, 'chatterbox');
    }

    if (trigger === 'comment' || trigger === 'role_change') {
      const [commentCount] = await db
        .select({ total: count() })
        .from(schema.comments)
        .where(eq(schema.comments.userId, userId));
      if (Number(commentCount?.total ?? 0) >= 1) await this.grantBadge(userId, 'breaking_the_silence');

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

    if (trigger === 'board_post' || trigger === 'board_reply' || trigger === 'role_change') {
      const starterRows = await db.execute(sql`
        SELECT 1
        FROM ${schema.boardPosts} p
        WHERE p.user_id = ${userId}
          AND p.is_deleted = false
          AND (
            SELECT COUNT(*)::int FROM ${schema.boardReplies} r
            WHERE r.post_id = p.id AND r.is_deleted = false
          ) >= 25
        LIMIT 1
      `);
      if ((starterRows.rows?.length ?? 0) > 0) await this.grantBadge(userId, 'conversation_starter');

      const dwellerRows = await db.execute(sql`
        SELECT COUNT(DISTINCT post_id)::int AS total FROM (
          SELECT id AS post_id FROM ${schema.boardPosts}
          WHERE user_id = ${userId} AND is_deleted = false
          UNION
          SELECT post_id FROM ${schema.boardReplies}
          WHERE user_id = ${userId} AND is_deleted = false
        ) t
      `);
      if (Number((dwellerRows.rows?.[0] as { total?: number })?.total ?? 0) >= 100) {
        await this.grantBadge(userId, 'forum_dweller');
      }
    }
  }

  private async evaluateReviewBadges(userId: string, trigger: BadgeTrigger): Promise<void> {
    if (trigger === 'review_create' || trigger === 'role_change') {
      const [reviewCount] = await db
        .select({ total: count() })
        .from(schema.reviews)
        .where(eq(schema.reviews.userId, userId));
      if (Number(reviewCount?.total ?? 0) >= 25) await this.grantBadge(userId, 'critic');
    }

    if (trigger === 'review_vote' || trigger === 'review_create' || trigger === 'role_change') {
      const upvotedReviews = await db
        .select({ reviewId: schema.reviews.id })
        .from(schema.reviews)
        .innerJoin(schema.reviewVotes, eq(schema.reviewVotes.reviewId, schema.reviews.id))
        .where(and(eq(schema.reviews.userId, userId), eq(schema.reviewVotes.type, 'like')))
        .groupBy(schema.reviews.id)
        .having(gt(count(schema.reviewVotes.reviewId), 0));
      if (upvotedReviews.length >= 5) await this.grantBadge(userId, 'hydras_voice');

      const [voteSum] = await db
        .select({ total: count() })
        .from(schema.reviews)
        .innerJoin(schema.reviewVotes, eq(schema.reviewVotes.reviewId, schema.reviews.id))
        .where(and(eq(schema.reviews.userId, userId), eq(schema.reviewVotes.type, 'like')));
      if (Number(voteSum?.total ?? 0) >= 100) await this.grantBadge(userId, 'trusted_reviewer');
    }
  }

  private async evaluateDiscoveryBadges(userId: string, trigger: BadgeTrigger): Promise<void> {
    if (trigger === 'import_request_complete' || trigger === 'role_change') {
      const [pathfinderRow] = await db
        .select({ total: count() })
        .from(schema.importRequests)
        .where(and(eq(schema.importRequests.userId, userId), eq(schema.importRequests.status, 'completed')));
      if (Number(pathfinderRow?.total ?? 0) >= 1) await this.grantBadge(userId, 'pathfinder');
    }

    if (trigger === 'manga_view' || trigger === 'role_change') {
      const viewRows = await db
        .select({
          seriesId: schema.mangaViews.seriesId,
          contentRating: schema.series.contentRating,
          genres: schema.series.genres,
        })
        .from(schema.mangaViews)
        .innerJoin(schema.series, eq(schema.series.id, schema.mangaViews.seriesId))
        .where(eq(schema.mangaViews.userId, userId));

      const nsfwSeriesIds = new Set<number>();
      for (const row of viewRows) {
        const genres = Array.isArray(row.genres) ? (row.genres as string[]) : [];
        if (isSeriesHiddenByUserNsfw({ contentRating: row.contentRating, genres }, true)) {
          nsfwSeriesIds.add(row.seriesId);
        }
      }
      if (nsfwSeriesIds.size >= 100) await this.grantBadge(userId, 'the_forbidden_shelf');
    }
  }

  private async evaluateSocialBadges(userId: string, trigger: BadgeTrigger): Promise<void> {
    if (trigger === 'follow' || trigger === 'role_change') {
      const [followerRow] = await db
        .select({ total: count() })
        .from(schema.userFollows)
        .where(eq(schema.userFollows.followingId, userId));
      if (Number(followerRow?.total ?? 0) >= 100) await this.grantBadge(userId, 'followed');
    }

    if (trigger === 'profile_update' || trigger === 'role_change') {
      await this.evaluateProfilePerfection(userId);
    }
  }

  private async evaluateProfilePerfection(userId: string): Promise<void> {
    const [userRow] = await db
      .select({ bio: schema.user.bio, image: schema.user.image })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    if (!userRow?.bio?.trim()) return;
    const image = userRow.image?.trim() || DEFAULT_AVATAR;
    if (image === DEFAULT_AVATAR) return;

    const [favRow] = await db
      .select({ total: count() })
      .from(schema.userFavoriteSeries)
      .where(eq(schema.userFavoriteSeries.userId, userId));
    if (Number(favRow?.total ?? 0) >= 1) await this.grantBadge(userId, 'profile_perfection');
  }

  private async evaluateCollectionBadges(userId: string, trigger: BadgeTrigger): Promise<void> {
    if (trigger === 'list_save' || trigger === 'role_change') {
      const curatorRows = await db.execute(sql`
        SELECT 1
        FROM ${schema.curatedLists} cl
        INNER JOIN ${schema.curatedListSaves} cls ON cls.list_id = cl.id
        WHERE cl.user_id = ${userId}
          AND cl.visibility = 'public'
        GROUP BY cl.id
        HAVING COUNT(cls.user_id) >= 25
        LIMIT 1
      `);
      if ((curatorRows.rows?.length ?? 0) > 0) await this.grantBadge(userId, 'curator');
    }
  }

  async evaluateBadges(userId: string, trigger: BadgeTrigger): Promise<void> {
    await this.syncRoleBadges(userId);
    await this.evaluateReadingBadges(userId, trigger);
    await this.evaluateCommunityBadges(userId, trigger);
    await this.evaluateReviewBadges(userId, trigger);
    await this.evaluateDiscoveryBadges(userId, trigger);
    await this.evaluateSocialBadges(userId, trigger);
    await this.evaluateCollectionBadges(userId, trigger);

    if (trigger === 'signup') {
      await this.evaluateSignupBadges(userId);
    } else if (trigger === 'role_change') {
      await this.syncOriginalLegacyBadges(userId);
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
