import { db, schema } from '@/db/index';
import { sql, desc, count, eq, and, gte, inArray, gt } from 'drizzle-orm';
import { cacheService } from '@/services/cacheService';
import { userProgressService } from '@/services/userProgressService';
import { readingActivityService } from '@/services/readingActivityService';
import { getThreshold } from '@/lib/periodUtils';

const CACHE_TTL = 120;
const DEFAULT_KARMA = { totalKarma: 0, level: 1, levelName: 'Rookie Reader' };
const PODIUM_SIZE = 3;

export type LeaderboardTab = 'overall' | 'chapters' | 'streaks' | 'comments' | 'reviews';
export type LeaderboardPeriod = 'all' | 'month' | 'week' | 'day';

export interface LeaderboardQuery {
  tab: LeaderboardTab;
  period: LeaderboardPeriod;
  page: number;
  limit: number;
}

interface LeaderboardUserBase {
  id: string;
  name: string;
  username: string | null;
  displayUsername: string | null;
  image: string | null;
  role: string;
}

interface SortedUser {
  user: LeaderboardUserBase;
  sortValue: number;
}

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

  async getLeaderboard({ tab, period, page, limit }: LeaderboardQuery) {
    const cacheKey = `leaderboard:${tab}:${period}:${page}:${limit}:v2`;
    return cacheService.getOrSet({ key: cacheKey, ttl: CACHE_TTL }, async () => {
      const tableOffset = PODIUM_SIZE + (page - 1) * limit;
      const [{ rows: podiumSorted, total }, { rows: tableSorted }] = await Promise.all([
        this.getSortedUsers(tab, period, PODIUM_SIZE, 0),
        this.getSortedUsers(tab, period, limit, tableOffset),
      ]);

      const allSorted = [...podiumSorted, ...tableSorted];
      if (allSorted.length === 0) {
        return {
          podium: [],
          rows: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        };
      }

      const userIds = [...new Set(allSorted.map((row) => row.user.id))];
      const [karmaMap, commentCounts, chapterCounts, reviewCounts, streakMap] = await Promise.all([
        userProgressService.getUserKarmaSummaries(userIds),
        this.getCommentCountsForUsers(userIds),
        this.getChapterCountsForUsers(userIds),
        this.getReviewCountsForUsers(userIds),
        readingActivityService.getLongestStreaksForUsers(userIds),
      ]);

      const buildRow = (entry: SortedUser, rank: number) => {
        const karma = karmaMap[entry.user.id] ?? DEFAULT_KARMA;
        const periodXp = tab === 'overall' && period !== 'all' ? entry.sortValue : undefined;
        return {
          rank,
          id: entry.user.id,
          name: entry.user.name,
          username: entry.user.username,
          displayUsername: entry.user.displayUsername,
          image: entry.user.image,
          role: entry.user.role,
          karma,
          chapters: chapterCounts[entry.user.id] ?? 0,
          comments: commentCounts[entry.user.id] ?? 0,
          streak: streakMap[entry.user.id] ?? 0,
          reviews: reviewCounts[entry.user.id] ?? 0,
          xp: periodXp ?? karma.totalKarma,
          periodXp,
          tabTotal: entry.sortValue,
        };
      };

      const podium = podiumSorted.map((entry, index) => buildRow(entry, index + 1));
      const rows = tableSorted.map((entry, index) => buildRow(entry, tableOffset + index + 1));
      const tableTotal = Math.max(0, total - PODIUM_SIZE);
      const totalPages = tableTotal > 0 ? Math.ceil(tableTotal / limit) : 0;

      return { podium, rows, pagination: { page, limit, total: tableTotal, totalPages } };
    });
  }

  private async getSortedUsers(tab: LeaderboardTab, period: LeaderboardPeriod, limit: number, offset: number): Promise<{ rows: SortedUser[]; total: number }> {
    switch (tab) {
      case 'overall':
        return this.getSortedOverall(period, limit, offset);
      case 'chapters':
        return this.getSortedChapters(limit, offset);
      case 'comments':
        return this.getSortedComments(limit, offset);
      case 'reviews':
        return this.getSortedReviews(limit, offset);
      case 'streaks':
        return this.getSortedStreaks(limit, offset);
      default:
        return { rows: [], total: 0 };
    }
  }

  private async getSortedOverall(period: LeaderboardPeriod, limit: number, offset: number): Promise<{ rows: SortedUser[]; total: number }> {
    const threshold = getThreshold(period);
    const userFields = {
      id: schema.user.id,
      name: schema.user.name,
      username: schema.user.username,
      displayUsername: schema.user.displayUsername,
      image: schema.user.image,
      role: schema.user.role,
    };

    if (!threshold) {
      const [rows, totalRow] = await Promise.all([
        db
          .select({ ...userFields, sortValue: schema.user.karmaTotal })
          .from(schema.user)
          .where(gt(schema.user.karmaTotal, 0))
          .orderBy(desc(schema.user.karmaTotal))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(schema.user).where(gt(schema.user.karmaTotal, 0)),
      ]);

      return {
        rows: rows.map((row) => ({ user: row, sortValue: row.sortValue })),
        total: Number(totalRow[0]?.total ?? 0),
      };
    }

    const periodKarma = db
      .select({
        userId: schema.karmaTransactions.userId,
        sortValue: sql<number>`sum(${schema.karmaTransactions.amount})`.mapWith(Number).as('sort_value'),
      })
      .from(schema.karmaTransactions)
      .where(gte(schema.karmaTransactions.createdAt, threshold))
      .groupBy(schema.karmaTransactions.userId)
      .having(sql`sum(${schema.karmaTransactions.amount}) > 0`)
      .as('period_karma');

    const [rows, totalRow] = await Promise.all([
      db
        .select({ ...userFields, sortValue: periodKarma.sortValue })
        .from(periodKarma)
        .innerJoin(schema.user, eq(schema.user.id, periodKarma.userId))
        .orderBy(desc(periodKarma.sortValue))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(periodKarma),
    ]);

    return {
      rows: rows.map((row) => ({
        user: {
          id: row.id,
          name: row.name,
          username: row.username,
          displayUsername: row.displayUsername,
          image: row.image,
          role: row.role,
        },
        sortValue: row.sortValue,
      })),
      total: Number(totalRow[0]?.total ?? 0),
    };
  }

  private async getSortedChapters(limit: number, offset: number): Promise<{ rows: SortedUser[]; total: number }> {
    const userFields = {
      id: schema.user.id,
      name: schema.user.name,
      username: schema.user.username,
      displayUsername: schema.user.displayUsername,
      image: schema.user.image,
      role: schema.user.role,
    };

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          ...userFields,
          sortValue: sql<number>`count(${schema.userChapterProgress.chapterId})`.mapWith(Number),
        })
        .from(schema.user)
        .innerJoin(
          schema.userChapterProgress,
          and(eq(schema.user.id, schema.userChapterProgress.userId), eq(schema.userChapterProgress.isRead, true))
        )
        .groupBy(schema.user.id)
        .orderBy(desc(sql`count(${schema.userChapterProgress.chapterId})`))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(distinct ${schema.user.id})`.mapWith(Number) })
        .from(schema.user)
        .innerJoin(
          schema.userChapterProgress,
          and(eq(schema.user.id, schema.userChapterProgress.userId), eq(schema.userChapterProgress.isRead, true))
        ),
    ]);

    return {
      rows: rows.map((row) => ({ user: row, sortValue: row.sortValue })),
      total: Number(totalRow[0]?.total ?? 0),
    };
  }

  private async getSortedComments(limit: number, offset: number): Promise<{ rows: SortedUser[]; total: number }> {
    const userFields = {
      id: schema.user.id,
      name: schema.user.name,
      username: schema.user.username,
      displayUsername: schema.user.displayUsername,
      image: schema.user.image,
      role: schema.user.role,
    };

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          ...userFields,
          sortValue: sql<number>`count(${schema.comments.id})`.mapWith(Number),
        })
        .from(schema.user)
        .innerJoin(schema.comments, eq(schema.user.id, schema.comments.userId))
        .groupBy(schema.user.id)
        .orderBy(desc(sql`count(${schema.comments.id})`))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(distinct ${schema.user.id})`.mapWith(Number) })
        .from(schema.user)
        .innerJoin(schema.comments, eq(schema.user.id, schema.comments.userId)),
    ]);

    return {
      rows: rows.map((row) => ({ user: row, sortValue: row.sortValue })),
      total: Number(totalRow[0]?.total ?? 0),
    };
  }

  private async getSortedReviews(limit: number, offset: number): Promise<{ rows: SortedUser[]; total: number }> {
    const userFields = {
      id: schema.user.id,
      name: schema.user.name,
      username: schema.user.username,
      displayUsername: schema.user.displayUsername,
      image: schema.user.image,
      role: schema.user.role,
    };

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          ...userFields,
          sortValue: sql<number>`count(${schema.reviews.id})`.mapWith(Number),
        })
        .from(schema.user)
        .innerJoin(schema.reviews, eq(schema.user.id, schema.reviews.userId))
        .groupBy(schema.user.id)
        .orderBy(desc(sql`count(${schema.reviews.id})`))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(distinct ${schema.user.id})`.mapWith(Number) })
        .from(schema.user)
        .innerJoin(schema.reviews, eq(schema.user.id, schema.reviews.userId)),
    ]);

    return {
      rows: rows.map((row) => ({ user: row, sortValue: row.sortValue })),
      total: Number(totalRow[0]?.total ?? 0),
    };
  }

  private async getSortedStreaks(limit: number, offset: number): Promise<{ rows: SortedUser[]; total: number }> {
    const usersWithDays = await db
      .selectDistinct({ userId: schema.userReadingDays.userId })
      .from(schema.userReadingDays);

    const userIds = usersWithDays.map((u) => u.userId);
    if (userIds.length === 0) return { rows: [], total: 0 };

    const streakMap = await readingActivityService.getLongestStreaksForUsers(userIds);
    const sorted = userIds
      .map((id) => ({ id, sortValue: streakMap[id] ?? 0 }))
      .filter((entry) => entry.sortValue > 0)
      .sort((a, b) => b.sortValue - a.sortValue);

    const total = sorted.length;
    const pageSlice = sorted.slice(offset, offset + limit);
    if (pageSlice.length === 0) return { rows: [], total };

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
      .where(inArray(schema.user.id, pageSlice.map((entry) => entry.id)));

    const userMap = new Map(userRows.map((user) => [user.id, user]));
    return {
      rows: pageSlice
        .map((entry) => {
          const user = userMap.get(entry.id);
          if (!user) return null;
          return { user, sortValue: entry.sortValue };
        })
        .filter((entry): entry is SortedUser => entry !== null),
      total,
    };
  }

  private async getCommentCountsForUsers(userIds: string[]): Promise<Record<string, number>> {
    if (userIds.length === 0) return {};
    const rows = await db
      .select({
        userId: schema.comments.userId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.comments)
      .where(inArray(schema.comments.userId, userIds))
      .groupBy(schema.comments.userId);
    return Object.fromEntries(rows.map((row) => [row.userId, row.count]));
  }

  private async getChapterCountsForUsers(userIds: string[]): Promise<Record<string, number>> {
    if (userIds.length === 0) return {};
    const rows = await db
      .select({
        userId: schema.userChapterProgress.userId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.userChapterProgress)
      .where(and(inArray(schema.userChapterProgress.userId, userIds), eq(schema.userChapterProgress.isRead, true)))
      .groupBy(schema.userChapterProgress.userId);
    return Object.fromEntries(rows.map((row) => [row.userId, row.count]));
  }

  private async getReviewCountsForUsers(userIds: string[]): Promise<Record<string, number>> {
    if (userIds.length === 0) return {};
    const rows = await db
      .select({
        userId: schema.reviews.userId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.reviews)
      .where(inArray(schema.reviews.userId, userIds))
      .groupBy(schema.reviews.userId);
    return Object.fromEntries(rows.map((row) => [row.userId, row.count]));
  }
}

export const leaderboardService = new LeaderboardService();
