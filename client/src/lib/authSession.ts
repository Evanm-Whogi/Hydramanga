import { authClient } from '@/lib/auth';
import { isUserBanned, type BanFields } from '@/lib/banHelpers';

const AUTH_MESSAGE_KEY = 'mang_auth_message';

/** Persist a one-time message for the login page after redirect. */
export function setAuthRedirectMessage(message: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(AUTH_MESSAGE_KEY, message);
  } catch {
    /* ignore */
  }
}

export function consumeAuthRedirectMessage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const msg = sessionStorage.getItem(AUTH_MESSAGE_KEY);
    if (msg) sessionStorage.removeItem(AUTH_MESSAGE_KEY);
    return msg;
  } catch {
    return null;
  }
}

/** Sign out locally and send the user to login with an optional flash message. */
export async function redirectToLogin(message?: string) {
  if (typeof window === 'undefined') return;
  if (message) setAuthRedirectMessage(message);
  try {
    await authClient.signOut();
  } catch {
    /* session may already be gone */
  }
  window.location.href = '/login';
}

/** Handle API 403 ban responses — never throws; redirects away from the app. */
export async function handleBannedApiResponse(message?: string) {
  await redirectToLogin(
    message || 'Your account has been suspended. Contact support if you believe this is an error.'
  );
  await new Promise<void>(() => {});
}

/** Handle API 401 — session invalid (e.g. after ban revoked all sessions). */
export async function handleUnauthorizedApiResponse() {
  await redirectToLogin();
  await new Promise<void>(() => {});
}

/** If the live session user is banned, sign out and redirect. */
export async function signOutIfBannedUser(user: BanFields | null | undefined) {
  if (!user || !isUserBanned(user)) return;
  await handleBannedApiResponse(
    user.banReason ||
      'Your account has been suspended. Contact support if you believe this is an error.'
  );
}
