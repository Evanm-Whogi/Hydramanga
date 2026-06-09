import { db, schema } from '@/db/index';
import { eq, or, max } from 'drizzle-orm';
import { userProgressService } from '@/services/userProgressService';
import { getUserSettings } from '@/services/userSettingsService';
import { badgeService } from '@/services/badgeService';
import { canViewProfileSection } from '@/lib/profileVisibility';

class ProfileService {
  /**
   * Resolve a profile by `username`, `id`, or the literal `"me"` (the viewer).
   * Accepting the id keeps older id-based links working after the username migration.
   */
  async getPublicProfile(identifier: string, viewerUserId: string | null) {
    if (identifier === 'me' && !viewerUserId) return null;

    const where =
      identifier === 'me'
        ? eq(schema.user.id, viewerUserId!)
        : or(eq(schema.user.username, identifier), eq(schema.user.id, identifier));

    const [userRow] = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        username: schema.user.username,
        image: schema.user.image,
        bio: schema.user.bio,
        role: schema.user.role,
        createdAt: schema.user.createdAt,
        karmaTotal: schema.user.karmaTotal,
      })
      .from(schema.user)
      .where(where)
      .limit(1);

    if (!userRow) return null;

    const targetUserId = userRow.id;
    const isOwner = viewerUserId !== null && targetUserId === viewerUserId;
    const settings = await getUserSettings(targetUserId);
    const [lastSession] = await db
      .select({ lastOnlineAt: max(schema.session.updatedAt) })
      .from(schema.session)
      .where(eq(schema.session.userId, targetUserId));

    if (!isOwner && !settings.isProfilePublic) {
      return {
        id: userRow.id,
        name: userRow.name,
        image: userRow.image,
        isPrivate: true,
        isOwner: false,
      };
    }

    const stats = await userProgressService.getUserStats(targetUserId);
    const badgeMap = await badgeService.getBadgesForUsers([targetUserId]);

    const { role, ...publicFields } = userRow;

    return {
      ...publicFields,
      lastOnlineAt: lastSession?.lastOnlineAt ?? userRow.createdAt,
      ...(isOwner ? { role } : {}),
      isPrivate: false,
      isOwner,
      isProfilePublic: settings.isProfilePublic,
      profileVisibility: settings.profileVisibility,
      badges: badgeMap[targetUserId] ?? [],
      stats: canViewProfileSection(settings.profileVisibility, 'readingStats', isOwner)
        ? {
            totalSeriesReading: stats.totalSeriesReading,
            averageCompletion: stats.averageCompletion,
            totalPagesRead: stats.totalPagesRead,
            seriesSaved: stats.seriesSaved,
            comments: stats.comments,
            chaptersRead: stats.chaptersRead,
            bookmarks: stats.bookmarks,
            daysActive: stats.daysActive,
            upvotes: stats.upvotes,
            downvotes: stats.downvotes,
            reputation: stats.reputation,
            typeBreakdown: stats.typeBreakdown,
            genreBreakdown: stats.genreBreakdown,
            streak: stats.streak,
            currentStreak: stats.currentStreak,
            karma: stats.karma,
          }
        : undefined,
    };
  }
}

export const profileService = new ProfileService();
