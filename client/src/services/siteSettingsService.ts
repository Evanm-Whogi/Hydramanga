import { cache } from 'react';
import { apiGet, apiPatch } from '@/lib/api';

export type PublicSiteSettings = {
  registrationEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  importRequestsEnabled: boolean;
  oauthGoogleEnabled: boolean;
  oauthDiscordEnabled: boolean;
  welcomeModalEnabled: boolean;
  welcomeModalTitle: string | null;
  welcomeModalDescription: string | null;
  welcomeModalBody: string | null;
};

export type AdminSiteSettings = PublicSiteSettings & {
  updatedAt: string;
};

const DEFAULT_PUBLIC_SETTINGS: PublicSiteSettings = {
  registrationEnabled: true,
  maintenanceMode: false,
  maintenanceMessage: null,
  importRequestsEnabled: true,
  oauthGoogleEnabled: true,
  oauthDiscordEnabled: true,
  welcomeModalEnabled: true,
  welcomeModalTitle: null,
  welcomeModalDescription: null,
  welcomeModalBody: null,
};

function normalizePublicSettings(settings?: Partial<PublicSiteSettings> | null): PublicSiteSettings {
  return {
    registrationEnabled: settings?.registrationEnabled ?? true,
    maintenanceMode: settings?.maintenanceMode ?? false,
    maintenanceMessage: settings?.maintenanceMessage ?? null,
    importRequestsEnabled: settings?.importRequestsEnabled ?? true,
    oauthGoogleEnabled: settings?.oauthGoogleEnabled ?? true,
    oauthDiscordEnabled: settings?.oauthDiscordEnabled ?? true,
    welcomeModalEnabled: settings?.welcomeModalEnabled ?? true,
    welcomeModalTitle: settings?.welcomeModalTitle ?? null,
    welcomeModalDescription: settings?.welcomeModalDescription ?? null,
    welcomeModalBody: settings?.welcomeModalBody ?? null,
  };
}

export const getSiteSettings = cache(async (): Promise<PublicSiteSettings> => {
  try {
    const data = await apiGet('/site-settings');
    return normalizePublicSettings((data as { settings?: PublicSiteSettings }).settings);
  } catch {
    return DEFAULT_PUBLIC_SETTINGS;
  }
});

export async function getAdminSiteSettings(): Promise<AdminSiteSettings> {
  const data = await apiGet('/admin/settings');
  return (data as { settings: AdminSiteSettings }).settings;
}

export async function patchAdminSiteSettings(updates: Partial<PublicSiteSettings>): Promise<AdminSiteSettings> {
  const data = await apiPatch('/admin/settings', updates);
  return (data as { settings: AdminSiteSettings }).settings;
}
