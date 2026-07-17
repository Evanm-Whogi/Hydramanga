import { db } from '@/db/index';
import { schema } from '@/db/index';
import { eq, sql } from 'drizzle-orm';
import { DEFAULT_PROFILE_VISIBILITY, normalizeProfileVisibility, type ProfileVisibility } from '@/lib/profileVisibility';

const DEFAULT_HIDE_NSFW = true;
const DEFAULT_PROFILE_PUBLIC = true;
const DEFAULT_INCOGNITO_MODE = false;
const SETTINGS_CACHE_TTL_MS = 60_000; // 1 minute

/** Crawlers should see the full public catalog for SEO; UI guests still default to hide. */
export const CRAWLER_UA_RE =
  /googlebot|google-inspectiontool|storebot-google|adsbot-google|bingbot|yandex(bot|images)|duckduckbot|slurp|baiduspider|facebookexternalhit|twitterbot|linkedinbot|applebot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot/i;

interface CachedSettings {
  settings: UserSettings;
  expiresAt: number;
}
const settingsCache = new Map<string, CachedSettings>();

export interface UserSettings {
  hideNsfw: boolean;
  isProfilePublic: boolean;
  incognitoMode: boolean;
  profileVisibility: ProfileVisibility;
}

/** Cookie used to persist the NSFW preference for logged-out (guest) visitors. */
export const GUEST_HIDE_NSFW_COOKIE = 'guest_hide_nsfw';

export function isCrawlerRequest(req: { headers?: { 'user-agent'?: string | string[] } }): boolean {
  const raw = req.headers?.['user-agent'];
  const ua = Array.isArray(raw) ? raw[0] : raw;
  return typeof ua === 'string' && CRAWLER_UA_RE.test(ua);
}

/**
 * Read the guest NSFW preference from a request's cookie header.
 * - Known crawlers: always show NSFW (so SSR metadata can index the full public catalog).
 * - Humans with no cookie: hide NSFW (matches UI default).
 * - Explicit cookie: honor it.
 */
export function getGuestHideNsfw(req: { headers?: { cookie?: string; 'user-agent'?: string | string[] } }): boolean {
  if (isCrawlerRequest(req)) return false;

  const raw = req.headers?.cookie;
  if (!raw) return DEFAULT_HIDE_NSFW;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== GUEST_HIDE_NSFW_COOKIE) continue;
    const value = decodeURIComponent(part.slice(eq + 1).trim());
    return value === '1' || value === 'true';
  }
  return DEFAULT_HIDE_NSFW;
}

/**
 * Resolve the effective "hide NSFW" preference for a request.
 * Crawlers always see NSFW (SEO). Logged-in humans use their account setting;
 * guests use {@link GUEST_HIDE_NSFW_COOKIE}.
 */
export async function resolveHideNsfw(
  req: { headers?: { cookie?: string; 'user-agent'?: string | string[] }; user?: { id?: string } | null },
): Promise<boolean> {
  // Bots first — never apply a human NSFW preference to crawlers indexing public URLs.
  if (isCrawlerRequest(req)) return false;
  const userId = req.user?.id;
  if (userId) return (await getUserSettings(userId)).hideNsfw;
  return getGuestHideNsfw(req);
}

export async function getUserSettings(userId: string | null | undefined): Promise<UserSettings> {
  if (!userId) {
    return {
      hideNsfw: DEFAULT_HIDE_NSFW,
      isProfilePublic: DEFAULT_PROFILE_PUBLIC,
      incognitoMode: DEFAULT_INCOGNITO_MODE,
      profileVisibility: DEFAULT_PROFILE_VISIBILITY,
    };
  }

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
      ? {
          hideNsfw: DEFAULT_HIDE_NSFW,
          isProfilePublic: DEFAULT_PROFILE_PUBLIC,
          incognitoMode: DEFAULT_INCOGNITO_MODE,
          profileVisibility: DEFAULT_PROFILE_VISIBILITY,
        }
      : {
          hideNsfw: row[0].hideNsfw,
          isProfilePublic: row[0].isProfilePublic ?? DEFAULT_PROFILE_PUBLIC,
          incognitoMode: row[0].incognitoMode ?? DEFAULT_INCOGNITO_MODE,
          profileVisibility: normalizeProfileVisibility(row[0].profileVisibility),
        };
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
  const incognitoMode =
    updates.incognitoMode ?? existing[0]?.incognitoMode ?? DEFAULT_INCOGNITO_MODE;
  const profileVisibility = updates.profileVisibility
    ? normalizeProfileVisibility({ ...normalizeProfileVisibility(existing[0]?.profileVisibility), ...updates.profileVisibility })
    : normalizeProfileVisibility(existing[0]?.profileVisibility);

  if (existing.length) {
    await db
      .update(schema.userSettings)
      .set({ hideNsfw, isProfilePublic, incognitoMode, profileVisibility, updatedAt: new Date() })
      .where(eq(schema.userSettings.userId, userId));
  } else {
    await db.insert(schema.userSettings).values({
      userId,
      hideNsfw,
      isProfilePublic,
      incognitoMode,
      profileVisibility,
    });
  }

  settingsCache.delete(userId);
  return { hideNsfw, isProfilePublic, incognitoMode, profileVisibility };
}

export async function incrementIncognitoChaptersRead(userId: string): Promise<number> {
  const existing = await db
    .select({ incognitoChaptersRead: schema.userSettings.incognitoChaptersRead })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);

  if (existing.length) {
    const [row] = await db
      .update(schema.userSettings)
      .set({
        incognitoChaptersRead: sql`${schema.userSettings.incognitoChaptersRead} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.userSettings.userId, userId))
      .returning({ incognitoChaptersRead: schema.userSettings.incognitoChaptersRead });
    settingsCache.delete(userId);
    return row?.incognitoChaptersRead ?? 0;
  }

  await db.insert(schema.userSettings).values({
    userId,
    hideNsfw: DEFAULT_HIDE_NSFW,
    isProfilePublic: DEFAULT_PROFILE_PUBLIC,
    incognitoMode: DEFAULT_INCOGNITO_MODE,
    incognitoChaptersRead: 1,
  });
  settingsCache.delete(userId);
  return 1;
}
