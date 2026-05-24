export class RateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

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
