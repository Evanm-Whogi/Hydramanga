/**
 * Guest NSFW preference.
 *
 * Logged-out visitors persist their "hide NSFW" choice in a cookie that the backend
 * reads (forwarded on SSR requests and same-origin /api requests) to filter content.
 * Once a visitor logs in, their account setting takes over and this cookie is ignored
 * server-side. The cookie name must stay in sync with the server constant
 * `GUEST_HIDE_NSFW_COOKIE` in server/src/services/userSettingsService.ts.
 */
export const GUEST_HIDE_NSFW_COOKIE = 'guest_hide_nsfw';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function getGuestHideNsfw(): boolean {
  // NSFW is hidden by default; only an explicit "show" cookie reveals it.
  if (typeof document === 'undefined') return true;
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${GUEST_HIDE_NSFW_COOKIE}=`));
  if (!match) return true;
  const value = decodeURIComponent(match.slice(GUEST_HIDE_NSFW_COOKIE.length + 1));
  return value !== '0' && value !== 'false';
}

export function setGuestHideNsfw(hideNsfw: boolean): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${GUEST_HIDE_NSFW_COOKIE}=${hideNsfw ? '1' : '0'}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}
