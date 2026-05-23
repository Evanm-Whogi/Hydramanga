import { db } from '@/db/index';
import { schema } from '@/db/index';
import { eq } from 'drizzle-orm';

const DEFAULT_HIDE_NSFW = false;
const DEFAULT_PROFILE_PUBLIC = true;
const SETTINGS_CACHE_TTL_MS = 60_000; // 1 minute

interface CachedSettings {
  settings: UserSettings;
  expiresAt: number;
}
const settingsCache = new Map<string, CachedSettings>();

export interface UserSettings {
  hideNsfw: boolean;
  isProfilePublic: boolean;
}

export async function getUserSettings(userId: string | null | undefined): Promise<UserSettings> {
  if (!userId) return { hideNsfw: DEFAULT_HIDE_NSFW, isProfilePublic: DEFAULT_PROFILE_PUBLIC };

  const now = Date.now();
  const cached = settingsCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.settings;

  const row = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);
  const settings: UserSettings =
    row.length === 0
      ? { hideNsfw: DEFAULT_HIDE_NSFW, isProfilePublic: DEFAULT_PROFILE_PUBLIC }
      : { hideNsfw: row[0].hideNsfw, isProfilePublic: row[0].isProfilePublic ?? DEFAULT_PROFILE_PUBLIC };
  settingsCache.set(userId, {
    settings,
    expiresAt: now + SETTINGS_CACHE_TTL_MS,
  });
  return settings;
}

export async function updateUserSettings(userId: string, updates: Partial<UserSettings>): Promise<UserSettings> {
  const existing = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);

  const hideNsfw = updates.hideNsfw ?? existing[0]?.hideNsfw ?? DEFAULT_HIDE_NSFW;
  const isProfilePublic =
    updates.isProfilePublic ?? existing[0]?.isProfilePublic ?? DEFAULT_PROFILE_PUBLIC;

  if (existing.length) {
    await db
      .update(schema.userSettings)
      .set({ hideNsfw, isProfilePublic, updatedAt: new Date() })
      .where(eq(schema.userSettings.userId, userId));
  } else {
    await db.insert(schema.userSettings).values({
      userId,
      hideNsfw,
      isProfilePublic,
    });
  }

  settingsCache.delete(userId);
  return { hideNsfw, isProfilePublic };
}
