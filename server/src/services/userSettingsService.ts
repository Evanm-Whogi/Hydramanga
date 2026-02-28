import { db } from '@/db/index';
import { schema } from '@/db/index';
import { eq } from 'drizzle-orm';

const DEFAULT_HIDE_NSFW = false;

export interface UserSettings {
  hideNsfw: boolean;
}

export async function getUserSettings(userId: string | null | undefined): Promise<UserSettings> {
  if (!userId) return { hideNsfw: DEFAULT_HIDE_NSFW };
  
  const row = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);
  if (!row.length) {
    return { hideNsfw: DEFAULT_HIDE_NSFW };
  }
  return {
    hideNsfw: row[0].hideNsfw,
  };
}

export async function updateUserSettings(userId: string, updates: Partial<UserSettings>): Promise<UserSettings> {
  const existing = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);

  const hideNsfw = updates.hideNsfw ?? existing[0]?.hideNsfw ?? DEFAULT_HIDE_NSFW;

  if (existing.length) {
    await db
      .update(schema.userSettings)
      .set({ hideNsfw, updatedAt: new Date() })
      .where(eq(schema.userSettings.userId, userId));
  } else {
    await db.insert(schema.userSettings).values({
      userId,
      hideNsfw,
    });
  }

  return { hideNsfw };
}
