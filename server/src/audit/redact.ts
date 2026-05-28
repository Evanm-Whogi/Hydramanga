const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'cookie',
  'authorization',
  'idToken',
]);

export function redactMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object') return null;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redactMetadata(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}
