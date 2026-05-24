/** Block discover filter URL sync while navigating away (prevents router.replace from canceling manga navigation). */
let urlSyncBlocked = false;

export function blockDiscoverUrlSync(): void {
  urlSyncBlocked = true;
}

export function unblockDiscoverUrlSync(): void {
  urlSyncBlocked = false;
}

export function isDiscoverUrlSyncBlocked(): boolean {
  return urlSyncBlocked;
}

/** Shallow URL update — does not trigger Next.js client navigation. */
export function replaceDiscoverUrl(pathWithQuery: string): void {
  if (typeof window === 'undefined') return;
  if (isDiscoverUrlSyncBlocked()) return;
  if (window.location.pathname !== '/discover') return;
  window.history.replaceState(window.history.state, '', pathWithQuery);
}
