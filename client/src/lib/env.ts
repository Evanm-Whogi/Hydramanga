// Centralized environment/config helpers

export const isServer = typeof window === 'undefined';

// Internal backend origin for server-to-server and Next.js rewrites
// In Docker, set BACKEND_INTERNAL_URL=http://server:4000
export function getBackendInternalUrl(): string {
  return process.env.BACKEND_INTERNAL_URL || 'http://localhost:4000';
}

// Public site URL used for OAuth callbacks and metadata
// Prefer NEXT_PUBLIC_URL; fallback to window.origin on client
export function getAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_URL;
  if (fromEnv) return fromEnv;
  if (!isServer && typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3000';
}

// API bases
export function getServerApiBase(): string {
  // Server-side should call backend routes directly (no /api prefix)
  return `${getBackendInternalUrl()}`;
}

export function getClientApiBase(): string {
  // Always use Next rewrite from the browser
  return '/api';
}
