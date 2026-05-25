const STORAGE_KEY = 'welcome-modal-dismissed-at';
const DISMISS_MS = 24 * 60 * 60 * 1000;

export function shouldShowWelcomeModal(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) return true;
    return Date.now() - dismissedAt >= DISMISS_MS;
  } catch {
    return true;
  }
}

export function dismissWelcomeModal(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // ignore quota / private mode
  }
}
