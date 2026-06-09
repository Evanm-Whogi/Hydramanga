/**
 * Sentry Helper Utilities
 * Provides consistent methods for creating spans, capturing errors, and adding context
 */

import * as Sentry from "@sentry/node";
import type { Job } from 'bullmq';
import { formatDbError, getPgErrorDetails } from '@/utils/dbError';

export interface SpanOptions {
  op?: string;
  description?: string;
  tags?: Record<string, string | number | boolean>;
  data?: Record<string, any>;
}

/**
 * Create a named transaction for a job/task
 * @param name - Transaction name (e.g., "import_job", "download_chapter")
 * @param fn - Async function to execute
 * @param options - Optional span configuration
 */
export async function withTransaction<T>(
  name: string,
  fn: () => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  return Sentry.startSpan(
    {
      name,
      op: options?.op || "job",
      attributes: {
        ...options?.tags,
        ...options?.data,
      },
    },
    fn
  );
}

/**
 * Create a child span within a transaction
 * @param name - Span name
 * @param fn - Async function to execute
 * @param options - Optional span configuration
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  return Sentry.startSpan(
    {
      op: options?.op || "db",
      name: name,
      attributes: {
        ...options?.tags,
        ...options?.data,
      },
    },
    fn
  );
}

/**
 * Add a breadcrumb for debugging
 * @param message - Breadcrumb message
 * @param level - Severity level
 * @param data - Additional context
 */
export function addBreadcrumb(
  message: string,
  level: "debug" | "info" | "warning" | "error" = "info",
  data?: Record<string, any>
): void {
  Sentry.captureMessage(message, level);
  Sentry.addBreadcrumb({
    message,
    level,
    data,
    timestamp: Date.now() / 1000,
  });
}

/** True when a BullMQ job has used all configured attempts (or job context is missing). */
export function isJobRetriesExhausted(job?: Job): boolean {
  if (!job) return true;
  const maxAttempts = job.opts?.attempts ?? 3;
  return (job.attemptsMade ?? 0) >= maxAttempts;
}

const ERROR_DETAIL_MAX_STRING_LENGTH = 32_000;

function safeSerialize(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[Max depth exceeded]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > ERROR_DETAIL_MAX_STRING_LENGTH
      ? `${value.slice(0, ERROR_DETAIL_MAX_STRING_LENGTH)}… [truncated ${value.length - ERROR_DETAIL_MAX_STRING_LENGTH} chars]`
      : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) return serializeErrorEntry(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeSerialize(item, depth + 1));
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record).slice(0, 40)) {
      output[key] = safeSerialize(nested, depth + 1);
    }
    return output;
  }
  return String(value);
}

function serializeErrorEntry(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { value: safeSerialize(error) };
  }

  const details: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack ?? null,
  };

  const errorRecord = error as unknown as Record<string, unknown>;
  const extra: Record<string, unknown> = {};
  for (const key of Object.keys(error)) {
    if (['name', 'message', 'stack', 'cause'].includes(key)) continue;
    extra[key] = safeSerialize(errorRecord[key]);
  }

  for (const key of ['code', 'syscall', 'errno', 'url', 'status', 'statusCode', 'response', 'config', 'request']) {
    const value = errorRecord[key];
    if (value !== undefined && extra[key] === undefined) {
      extra[key] = safeSerialize(value);
    }
  }

  if (Object.keys(extra).length > 0) {
    details.extra = extra;
  }

  if (error.cause !== undefined) {
    details.cause = serializeErrorEntry(error.cause);
  }

  return details;
}

/** Flatten an error and its cause chain into Sentry-friendly detail objects. */
export function serializeErrorDetails(error: unknown): Record<string, unknown> {
  const chain: unknown[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = current instanceof Error ? current.cause : undefined;
  }

  return {
    formatted: formatDbError(error),
    chain: chain.map((item) => serializeErrorEntry(item)),
  };
}

/** Serialize BullMQ job metadata for Sentry diagnostics. */
export function serializeJobForSentry(job: Job | undefined, queueName?: string): Record<string, unknown> | null {
  if (!job) return null;

  const jobRecord = job as Job & {
    failedReason?: string;
    stacktrace?: string[];
    processedOn?: number;
    finishedOn?: number;
    timestamp?: number;
  };

  return {
    queue_name: queueName ?? null,
    id: job.id ?? null,
    name: job.name ?? null,
    attempts_made: job.attemptsMade ?? null,
    max_attempts: job.opts?.attempts ?? null,
    failed_reason: jobRecord.failedReason ?? null,
    stacktrace: jobRecord.stacktrace ?? null,
    processed_on: jobRecord.processedOn ?? null,
    finished_on: jobRecord.finishedOn ?? null,
    enqueued_at: jobRecord.timestamp ?? null,
    opts: safeSerialize({
      attempts: job.opts?.attempts,
      backoff: job.opts?.backoff,
      priority: job.opts?.priority,
      jobId: job.opts?.jobId,
    }),
    data: safeSerialize(job.data),
  };
}

/** Capture to Sentry only after the final failed attempt for a queued job. */
export function captureJobErrorIfFinal(job: Job | undefined, error: Error | unknown, context?: { tags?: Record<string, string>; data?: Record<string, any>; queueName?: string }): void {
  if (!isJobRetriesExhausted(job)) return;
  captureError(error, { ...context, job });
}

/**
 * Capture an error with context
 * @param error - Error object
 * @param context - Additional context tags and data
 */
export function captureError(
  error: Error | unknown,
  context?: {
    tags?: Record<string, string>;
    data?: Record<string, any>;
    job?: Job;
    queueName?: string;
  }
): void {
  Sentry.withScope((scope) => {
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    if (context?.data) {
      scope.setContext("error_context", context.data);
    }

    scope.setContext('error_details', serializeErrorDetails(error));

    const jobContext = serializeJobForSentry(context?.job, context?.queueName);
    if (jobContext) {
      scope.setContext('job', jobContext);
    }

    const pgError = getPgErrorDetails(error);
    if (pgError) {
    scope.setContext("postgres_error", { ...pgError });
      if (pgError.code) {
        scope.setTag("pg_code", pgError.code);
      }
    }

    scope.setContext("db_error", {
      formatted: formatDbError(error),
    });

    Sentry.captureException(error);
  });
}

/**
 * Set job context (series ID, chapter number, etc.)
 * @param jobType - Type of job
 * @param context - Job-specific context
 */
export function setJobContext(
  jobType: "import" | "chapter_scan" | "chapter_download",
  context: Record<string, any>
): void {
  Sentry.withScope((scope) => {
    scope.setContext(jobType, context);
  });
}

/**
 * Measure and report operation duration
 * @param name - Operation name
 * @param fn - Function to measure
 * @param options - Span options
 */
export async function measureOperation<T>(
  name: string,
  fn: () => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await withSpan(name, fn, options);
    const duration = Date.now() - startTime;

    Sentry.addBreadcrumb({
      message: `${name} completed`,
      level: "info",
      data: { duration_ms: duration },
      timestamp: Date.now() / 1000,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    addBreadcrumb(`${name} failed after ${duration}ms`, "error", {
      duration_ms: duration,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}


