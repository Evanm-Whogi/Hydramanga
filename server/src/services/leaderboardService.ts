import { db, schema } from '@/db/index';
import { sql, desc, count, eq, and, gte, inArray } from 'drizzle-orm';
import { cacheService } from '@/services/cacheService';
import { userProgressService } from '@/services/userProgressService';
import { readingActivityService } from '@/services/readingActivityService';

const CACHE_TTL = 120;

class LeaderboardService {
  async getSummary() {
    const cacheKey = 'leaderboard:summary';
    return cacheService.getOrSet(
      { key: cacheKey, ttl: CACHE_TTL },
      async () => {
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);

        const [commentsRow, membersRow, monthCommentsRow] = await Promise.all([
          db.select({ total: count() }).from(schema.comments),
          db.select({ total: count() }).from(schema.user),
          db
            .select({ total: count() })
            .from(schema.comments)
            .where(gte(schema.comments.createdAt, monthStart)),
        ]);

        return {
          totalComments: Number(commentsRow[0]?.total ?? 0),
          totalMembers: Number(membersRow[0]?.total ?? 0),
          commentsThisMonth: Number(monthCommentsRow[0]?.total ?? 0),
        };
      }
    );
  }

  async getTopCommenters(limit = 50) {
    const cacheKey = `leaderboard:commenters:${limit}`;
    return cacheService.getOrSet({ key: cacheKey, ttl: CACHE_TTL }, async () => {
      const rows = await db
        .select({
          id: schema.user.id,
          name: schema.user.name,
          username: schema.user.username,
          displayUsername: schema.user.displayUsername,
          image: schema.user.image,
          role: schema.user.role,
          commentCount: sql<number>`count(${schema.comments.id})`.mapWith(Number),
        })
        .from(schema.user)
        .innerJoin(schema.comments, eq(schema.user.id, schema.comments.userId))
        .groupBy(schema.user.id)
        .orderBy(desc(sql`count(${schema.comments.id})`))
        .limit(limit);

      const karmaMap = await userProgressService.getUserKarmaSummaries(rows.map((r) => r.id));
      return rows.map((row, index) => ({
        rank: index + 1,
        ...row,
        karma: karmaMap[row.id] ?? { totalKarma: 0, level: 1, levelName: 'Rookie Reader' },
      }));
    });
  }

  async getTopReaders(limit = 50) {
    const cacheKey = `leaderboard:readers:${limit}`;
    return cacheService.getOrSet({ key: cacheKey, ttl: CACHE_TTL }, async () => {
      const rows = await db
        .select({
          id: schema.user.id,
          name: schema.user.name,
          username: schema.user.username,
          displayUsername: schema.user.displayUsername,
          image: schema.user.image,
          role: schema.user.role,
          seriesRead: sql<number>`count(distinct ${schema.userReadingProgress.seriesId})`.mapWith(Number),
        })
        .from(schema.user)
        .innerJoin(
          schema.userReadingProgress,
          and(
            eq(schema.user.id, schema.userReadingProgress.userId),
            sql`${schema.userReadingProgress.percentageCompleted} > 0`
          )
        )
        .groupBy(schema.user.id)
        .orderBy(desc(sql`count(distinct ${schema.userReadingProgress.seriesId})`))
        .limit(limit);

      const karmaMap = await userProgressService.getUserKarmaSummaries(rows.map((r) => r.id));
      return rows.map((row, index) => ({
        rank: index + 1,
        ...row,
        karma: karmaMap[row.id] ?? { totalKarma: 0, level: 1, levelName: 'Rookie Reader' },
      }));
    });
  }

  async getTopStreaks(limit = 50) {
    const cacheKey = `leaderboard:streaks:${limit}`;
    return cacheService.getOrSet({ key: cacheKey, ttl: CACHE_TTL }, async () => {
      const usersWithDays = await db
        .selectDistinct({ userId: schema.userReadingDays.userId })
        .from(schema.userReadingDays);

      const userIds = usersWithDays.map((u) => u.userId);
      if (userIds.length === 0) return [];

      const streakMap = await readingActivityService.getLongestStreaksForUsers(userIds);
      const sorted = userIds
        .map((id) => ({ id, longestStreak: streakMap[id] ?? 0 }))
        .filter((u) => u.longestStreak > 0)
        .sort((a, b) => b.longestStreak - a.longestStreak)
        .slice(0, limit);

      if (sorted.length === 0) return [];

      const userRows = await db
        .select({
          id: schema.user.id,
          name: schema.user.name,
          username: schema.user.username,
          displayUsername: schema.user.displayUsername,
          image: schema.user.image,
          role: schema.user.role,
        })
        .from(schema.user)
        .where(inArray(schema.user.id, sorted.map((s) => s.id)));

      const userMap = new Map(userRows.map((u) => [u.id, u]));
      const karmaMap = await userProgressService.getUserKarmaSummaries(sorted.map((s) => s.id));

      return sorted.map((entry, index) => {
        const user = userMap.get(entry.id);
        return {
          rank: index + 1,
          id: entry.id,
          name: user?.name ?? 'Unknown',
          username: user?.username,
          displayUsername: user?.displayUsername,
          image: user?.image,
          role: user?.role,
          longestStreak: entry.longestStreak,
          karma: karmaMap[entry.id] ?? { totalKarma: 0, level: 1, levelName: 'Rookie Reader' },
        };
      });
    });
  }
}

export const leaderboardService = new LeaderboardService();
