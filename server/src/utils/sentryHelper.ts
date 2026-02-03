/**
 * Sentry Helper Utilities
 * Provides consistent methods for creating spans, capturing errors, and adding context
 */

import * as Sentry from "@sentry/node";

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


