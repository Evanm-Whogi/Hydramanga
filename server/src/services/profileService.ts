import { db, schema } from '@/db/index';
import { eq } from 'drizzle-orm';
import { userProgressService } from '@/services/userProgressService';
import { getUserSettings } from '@/services/userSettingsService';

class ProfileService {
  async getPublicProfile(targetUserId: string, viewerUserId: string) {
    const [userRow] = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        image: schema.user.image,
        bio: schema.user.bio,
        role: schema.user.role,
        createdAt: schema.user.createdAt,
        karmaTotal: schema.user.karmaTotal,
      })
      .from(schema.user)
      .where(eq(schema.user.id, targetUserId))
      .limit(1);

    if (!userRow) return null;

    const isOwner = targetUserId === viewerUserId;
    const settings = await getUserSettings(targetUserId);

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

    return {
      ...userRow,
      isPrivate: false,
      isOwner,
      isProfilePublic: settings.isProfilePublic,
      stats: {
        totalSeriesReading: stats.totalSeriesReading,
        averageCompletion: stats.averageCompletion,
        totalPagesRead: stats.totalPagesRead,
        seriesSaved: stats.seriesSaved,
        streak: stats.streak,
        currentStreak: stats.currentStreak,
        karma: stats.karma,
      },
    };
  }
}

export const profileService = new ProfileService();
