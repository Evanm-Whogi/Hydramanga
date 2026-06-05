/** Non-Error rate-limit signal so Next.js dev does not treat 429s as runtime crashes. */
export type RateLimitSignal = {
  kind: 'rate_limit';
  message: string;
  retryAfterMs: number;
};

const toastedSignals = new WeakSet<RateLimitSignal>();
const pendingToasts = new WeakSet<RateLimitSignal>();

function showFallbackToast(message: string): void {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.setAttribute('role', 'alert');
  el.textContent = message;
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '1rem',
    right: '1rem',
    zIndex: '9999',
    maxWidth: '20rem',
    padding: '0.75rem 1rem',
    borderRadius: '0.5rem',
    background: '#1f2937',
    color: '#fca5a5',
    fontSize: '0.875rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
  });
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 5000);
}

export function isRateLimited(error: unknown): error is RateLimitSignal {
  return typeof error === 'object' && error !== null && (error as RateLimitSignal).kind === 'rate_limit';
}

/** @deprecated Use isRateLimited */
export const isRateLimitError = isRateLimited;

export function parseRetryAfterMs(
  response: Response,
  body: { retryAfterMs?: number; message?: string }
): number {
  if (typeof body.retryAfterMs === 'number' && body.retryAfterMs > 0) {
    return body.retryAfterMs;
  }
  const header = response.headers.get('Retry-After');
  if (header) {
    const sec = parseInt(header, 10);
    if (!Number.isNaN(sec) && sec > 0) return sec * 1000;
  }
  return 60_000;
}

let rejectionHandlerInstalled = false;

export function installRateLimitRejectionHandler(): void {
  if (typeof window === 'undefined' || rejectionHandlerInstalled) return;
  rejectionHandlerInstalled = true;
  window.addEventListener('unhandledrejection', (event) => {
    if (!isRateLimited(event.reason)) return;
    showRateLimitToast(event.reason);
    event.preventDefault();
  });
}

export function showRateLimitToast(error: unknown): void {
  if (typeof window === 'undefined' || !isRateLimited(error)) return;
  installRateLimitRejectionHandler();
  if (toastedSignals.has(error) || pendingToasts.has(error)) return;
  pendingToasts.add(error);
  void import('react-toastify')
    .then(({ toast }) => {
      toast.error(error.message);
      toastedSignals.add(error);
    })
    .catch(() => {
      showFallbackToast(error.message);
      toastedSignals.add(error);
    })
    .finally(() => {
      pendingToasts.delete(error);
    });
}

/** Returns a rate-limit signal (toast shown). Does not throw. */
export function parseRateLimitedResponse(res: Response, body: { retryAfterMs?: number; message?: string; error?: string }): RateLimitSignal | null {
  if (res.status !== 429) return null;
  const signal: RateLimitSignal = {
    kind: 'rate_limit',
    message: body?.message || body?.error || 'Too many requests. Please wait before trying again.',
    retryAfterMs: parseRetryAfterMs(res, body),
  };
  showRateLimitToast(signal);
  return signal;
}

/** Toast for API failures; rate limits use the server message and dedupe. */
export function toastApiError(error: unknown, fallback: string): void {
  if (isRateLimited(error)) {
    showRateLimitToast(error);
    return;
  }
  const message = error instanceof Error && error.message ? error.message : fallback;
  if (typeof window === 'undefined') return;
  void import('react-toastify').then(({ toast }) => toast.error(message));
}

export function rateLimitToastMessage(error: unknown, fallback: string): string {
  if (isRateLimited(error)) {
    showRateLimitToast(error);
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

if (typeof window !== 'undefined') {
  installRateLimitRejectionHandler();
}
