import { db, schema } from '@/db/index';
import { and, count, eq } from 'drizzle-orm';
import { resolveUserId } from '@/services/profileSectionService';
import { badgeService } from '@/services/badgeService';

class UserFollowService {
  async getFollowMeta(targetUserId: string, viewerUserId: string | null): Promise<{ followerCount: number; isFollowing: boolean }> {
    const [followerCountRow, followingRow] = await Promise.all([
      db.select({ count: count() }).from(schema.userFollows).where(eq(schema.userFollows.followingId, targetUserId)),
      viewerUserId && viewerUserId !== targetUserId
        ? db.query.userFollows.findFirst({
            where: and(eq(schema.userFollows.followerId, viewerUserId), eq(schema.userFollows.followingId, targetUserId)),
          })
        : Promise.resolve(null),
    ]);

    return {
      followerCount: Number(followerCountRow[0]?.count ?? 0),
      isFollowing: Boolean(followingRow),
    };
  }

  async followUser(followerId: string, identifier: string) {
    const resolved = await resolveUserId(identifier, followerId);
    if (!resolved) throw new Error('User not found');
    if (resolved.userId === followerId) throw new Error('Cannot follow yourself');

    const existing = await db.query.userFollows.findFirst({
      where: and(eq(schema.userFollows.followerId, followerId), eq(schema.userFollows.followingId, resolved.userId)),
    });
    if (!existing) {
      await db.insert(schema.userFollows).values({ followerId, followingId: resolved.userId });
      badgeService.evaluateBadgesAsync(resolved.userId, 'follow');
    }

    return this.getFollowMeta(resolved.userId, followerId);
  }

  async unfollowUser(followerId: string, identifier: string) {
    const resolved = await resolveUserId(identifier, followerId);
    if (!resolved) throw new Error('User not found');

    await db.delete(schema.userFollows).where(
      and(eq(schema.userFollows.followerId, followerId), eq(schema.userFollows.followingId, resolved.userId)),
    );

    return this.getFollowMeta(resolved.userId, followerId);
  }
}

export const userFollowService = new UserFollowService();
