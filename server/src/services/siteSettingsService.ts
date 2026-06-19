import { db, schema } from '@/db/index';
import { eq } from 'drizzle-orm';

const SITE_SETTINGS_ID = 1;
const CACHE_MS = 5000;

export type SiteSettings = {
  registrationEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  importRequestsEnabled: boolean;
  guestReadingEnabled: boolean;
  oauthGoogleEnabled: boolean;
  oauthDiscordEnabled: boolean;
  welcomeModalEnabled: boolean;
  welcomeModalTitle: string | null;
  welcomeModalDescription: string | null;
  welcomeModalBody: string | null;
  updatedAt: Date;
};

export type PublicSiteSettings = Omit<SiteSettings, 'updatedAt'>;

export type SiteSettingsUpdate = {
  registrationEnabled?: boolean;
  maintenanceMode?: boolean;
  maintenanceMessage?: string | null;
  importRequestsEnabled?: boolean;
  guestReadingEnabled?: boolean;
  oauthGoogleEnabled?: boolean;
  oauthDiscordEnabled?: boolean;
  welcomeModalEnabled?: boolean;
  welcomeModalTitle?: string | null;
  welcomeModalDescription?: string | null;
  welcomeModalBody?: string | null;
};

let cache: { settings: SiteSettings; expiresAt: number } | null = null;

function trimText(value: string | null | undefined, maxLen: number): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLen) : null;
}

function mapRow(row: typeof schema.siteSettings.$inferSelect): SiteSettings {
  return {
    registrationEnabled: row.registrationEnabled,
    maintenanceMode: row.maintenanceMode,
    maintenanceMessage: trimText(row.maintenanceMessage, 2000),
    importRequestsEnabled: row.importRequestsEnabled,
    guestReadingEnabled: row.guestReadingEnabled,
    oauthGoogleEnabled: row.oauthGoogleEnabled,
    oauthDiscordEnabled: row.oauthDiscordEnabled,
    welcomeModalEnabled: row.welcomeModalEnabled,
    welcomeModalTitle: trimText(row.welcomeModalTitle, 200),
    welcomeModalDescription: trimText(row.welcomeModalDescription, 500),
    welcomeModalBody: trimText(row.welcomeModalBody, 8000),
    updatedAt: row.updatedAt,
  };
}

function invalidateCache(): void {
  cache = null;
}

async function ensureRow(): Promise<void> {
  const existing = await db.select({ id: schema.siteSettings.id }).from(schema.siteSettings).where(eq(schema.siteSettings.id, SITE_SETTINGS_ID)).limit(1);
  if (existing.length === 0) {
    await db.insert(schema.siteSettings).values({ id: SITE_SETTINGS_ID });
  }
}

class SiteSettingsService {
  async getSettings(): Promise<SiteSettings> {
    if (cache && cache.expiresAt > Date.now()) return cache.settings;

    await ensureRow();
    const [row] = await db.select().from(schema.siteSettings).where(eq(schema.siteSettings.id, SITE_SETTINGS_ID)).limit(1);
    if (!row) {
      await db.insert(schema.siteSettings).values({ id: SITE_SETTINGS_ID });
      return this.getSettings();
    }

    const settings = mapRow(row);
    cache = { settings, expiresAt: Date.now() + CACHE_MS };
    return settings;
  }

  getPublicSettings(settings: SiteSettings): PublicSiteSettings {
    const { updatedAt: _updatedAt, ...publicSettings } = settings;
    return publicSettings;
  }

  async updateSettings(updates: SiteSettingsUpdate): Promise<SiteSettings> {
    await ensureRow();

    const patch: Partial<typeof schema.siteSettings.$inferInsert> = { updatedAt: new Date() };
    if (typeof updates.registrationEnabled === 'boolean') patch.registrationEnabled = updates.registrationEnabled;
    if (typeof updates.maintenanceMode === 'boolean') patch.maintenanceMode = updates.maintenanceMode;
    if (updates.maintenanceMessage !== undefined) patch.maintenanceMessage = trimText(updates.maintenanceMessage, 2000);
    if (typeof updates.importRequestsEnabled === 'boolean') patch.importRequestsEnabled = updates.importRequestsEnabled;
    if (typeof updates.guestReadingEnabled === 'boolean') patch.guestReadingEnabled = updates.guestReadingEnabled;
    if (typeof updates.oauthGoogleEnabled === 'boolean') patch.oauthGoogleEnabled = updates.oauthGoogleEnabled;
    if (typeof updates.oauthDiscordEnabled === 'boolean') patch.oauthDiscordEnabled = updates.oauthDiscordEnabled;
    if (typeof updates.welcomeModalEnabled === 'boolean') patch.welcomeModalEnabled = updates.welcomeModalEnabled;
    if (updates.welcomeModalTitle !== undefined) patch.welcomeModalTitle = trimText(updates.welcomeModalTitle, 200);
    if (updates.welcomeModalDescription !== undefined) patch.welcomeModalDescription = trimText(updates.welcomeModalDescription, 500);
    if (updates.welcomeModalBody !== undefined) patch.welcomeModalBody = trimText(updates.welcomeModalBody, 8000);

    await db.update(schema.siteSettings).set(patch).where(eq(schema.siteSettings.id, SITE_SETTINGS_ID));
    invalidateCache();
    return this.getSettings();
  }
}

export const siteSettingsService = new SiteSettingsService();
