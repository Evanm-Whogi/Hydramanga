import logger from '@/services/loggerService';

export interface PgErrorDetails {
  message: string;
  code?: string;
  detail?: string;
  hint?: string;
  constraint?: string;
}

const TRANSIENT_PG_CODES = new Set([
  '40P01', // deadlock_detected
  '40001', // serialization_failure
  '57P01', // admin_shutdown
  '08006', // connection_failure
  '08003', // connection_does_not_exist
  '08001', // sqlclient_unable_to_establish_sqlconnection
]);

const TRANSIENT_NODE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED']);

const TRANSIENT_MESSAGE_FRAGMENTS = [
  'timeout exceeded when trying to connect',
  'connection terminated',
  'connection reset',
  'server closed the connection unexpectedly',
];

function isPgErrorLike(value: unknown): value is Record<string, unknown> & { message: string } {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const message = record.message;
  if (typeof message !== 'string') return false;
  if (typeof record.code === 'string') {
    return /^[0-9A-Z]{5}$/.test(record.code) || TRANSIENT_NODE_CODES.has(record.code);
  }
  return TRANSIENT_MESSAGE_FRAGMENTS.some((fragment) =>
    message.toLowerCase().includes(fragment)
  );
}

function walkErrorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = current instanceof Error ? current.cause : undefined;
  }

  return chain;
}

export function getPgErrorDetails(error: unknown): PgErrorDetails | null {
  for (const item of walkErrorChain(error)) {
    if (!isPgErrorLike(item)) continue;

    const record = item as Record<string, unknown> & { message: string };
    return {
      message: record.message,
      code: typeof record.code === 'string' ? record.code : undefined,
      detail: typeof record.detail === 'string' ? record.detail : undefined,
      hint: typeof record.hint === 'string' ? record.hint : undefined,
      constraint: typeof record.constraint === 'string' ? record.constraint : undefined,
    };
  }

  return null;
}

export function formatDbError(error: unknown): string {
  const wrapperMessage = error instanceof Error ? error.message : String(error);
  const pg = getPgErrorDetails(error);

  if (!pg) return wrapperMessage;

  const parts = [wrapperMessage];
  if (pg.code) parts.push(`pg_code=${pg.code}`);
  if (pg.message && pg.message !== wrapperMessage) parts.push(`pg_message=${pg.message}`);
  if (pg.detail) parts.push(`pg_detail=${pg.detail}`);
  if (pg.constraint) parts.push(`pg_constraint=${pg.constraint}`);

  return parts.join(' | ');
}

export function isTransientDbError(error: unknown): boolean {
  for (const item of walkErrorChain(error)) {
    if (!item || typeof item !== 'object') continue;

    const record = item as Record<string, unknown>;
    const code = typeof record.code === 'string' ? record.code : undefined;
    const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';

    if (code && (TRANSIENT_PG_CODES.has(code) || TRANSIENT_NODE_CODES.has(code))) {
      return true;
    }

    if (TRANSIENT_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment))) {
      return true;
    }
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  options?: { maxAttempts?: number; baseDelayMs?: number; label?: string }
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 500;
  const label = options?.label ?? 'db_operation';
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !isTransientDbError(error)) {
        throw error;
      }

      const delayMs = baseDelayMs * attempt;
      logger.warn(
        `[DB] Transient error during ${label} (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms: ${formatDbError(error)}`,
        {
          service: 'dbError',
          pg_error: getPgErrorDetails(error),
          attempt,
          maxAttempts,
        }
      );

      await sleep(delayMs);
    }
  }

  throw lastError;
}
