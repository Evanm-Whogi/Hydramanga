const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const lastTouchedAt = new Map<string, number>();

export function shouldTouchSession(sessionId: string): boolean {
  const now = Date.now();
  const last = lastTouchedAt.get(sessionId);
  if (last != null && now - last < SESSION_TOUCH_INTERVAL_MS) return false;
  lastTouchedAt.set(sessionId, now);
  return true;
}

export function clearSessionTouchCache(sessionId: string): void {
  lastTouchedAt.delete(sessionId);
}
