/**
 * Error sanitization utilities to prevent sensitive data leakage
 * Ensures PII (Personally Identifiable Information) and secrets are not tracked
 */

const SENSITIVE_PATTERNS = [
  // Email addresses
  /[\w\.-]+@[\w\.-]+\.\w+/g,
  // API keys and tokens (common patterns)
  /(['\"])?(api_?key|token|secret|password|auth|bearer)(['\"])?\s*[:=]\s*[^\s,})\]]+/gi,
  // URLs with credentials
  /(https?:\/\/)([^:]+):([^@]+)@/g,
  // Phone numbers (basic)
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  // Social Security Numbers
  /\b\d{3}-\d{2}-\d{4}\b/g,
  // Credit card numbers
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
];

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  'Cannot read properties of undefined': 'Null reference error',
  'Cannot read property': 'Property access error',
  'is not a function': 'Type error',
  'is not defined': 'Reference error',
  'Network request failed': 'Network error',
  'Failed to fetch': 'Network error',
  'timeout': 'Request timeout',
};

/**
 * Sanitize error message by removing sensitive information
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return 'An error occurred';

  let sanitized = message;

  // Replace sensitive patterns with generic placeholders
  SENSITIVE_PATTERNS.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });

  // Check if message matches a safe pattern we recognize
  for (const [original, safe] of Object.entries(SAFE_ERROR_MESSAGES)) {
    if (sanitized.includes(original)) {
      return safe;
    }
  }

  // Truncate very long messages (might contain large data dumps)
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200) + '...';
  }

  return sanitized;
}

/**
 * Sanitize error stack trace by removing sensitive file paths and credentials
 */
export function sanitizeStackTrace(stack: string | undefined): string | undefined {
  if (!stack) return undefined;

  let sanitized = stack;

  // Remove full file paths, keep only relevant parts
  sanitized = sanitized.replace(/\/home\/[^/\s]+\//g, '/[USER_HOME]/');
  sanitized = sanitized.replace(/C:\\Users\\[^\\]+\\/g, 'C:\\[USER]\\');

  // Remove sensitive patterns
  SENSITIVE_PATTERNS.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });

  // Limit stack trace length
  const lines = sanitized.split('\n');
  if (lines.length > 10) {
    sanitized = lines.slice(0, 10).join('\n') + '\n... (truncated)';
  }

  return sanitized;
}

/**
 * Sanitize error context to prevent leaking sensitive data
 */
export function sanitizeErrorContext(context: Record<string, any> | undefined): Record<string, any> | undefined {
  if (!context) return undefined;

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(context)) {
    // Skip sensitive keys entirely
    if (
      key.toLowerCase().includes('password') ||
      key.toLowerCase().includes('token') ||
      key.toLowerCase().includes('secret') ||
      key.toLowerCase().includes('key') ||
      key.toLowerCase().includes('auth') ||
      key.toLowerCase().includes('credential')
    ) {
      continue;
    }

    // Sanitize string values
    if (typeof value === 'string') {
      sanitized[key] = sanitizeErrorMessage(value);
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects (but limit depth)
      sanitized[key] = JSON.stringify(value).substring(0, 500);
    } else {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

/**
 * Check if error should be tracked (filter out noisy/irrelevant errors)
 */
export function shouldTrackError(errorMessage: string, errorType: string): boolean {
  // Don't track errors from browser extensions
  const extensionErrors = [
    'chrome-extension://',
    'moz-extension://',
    'safari-extension://',
    'Script error',
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection',
  ];

  if (extensionErrors.some((err) => errorMessage.includes(err) || errorType.includes(err))) {
    return false;
  }

  // Don't track very generic errors that don't provide value
  const genericErrors = ['Script error', 'Error', 'Unknown error'];
  if (
    genericErrors.includes(errorType) &&
    !errorMessage &&
    !errorMessage.includes('at ')
  ) {
    return false;
  }

  return true;
}
