// Centralized environment/config helpers

export const isServer = typeof window === 'undefined';

// Internal backend origin for server-to-server and Next.js rewrites
// In Docker, set BACKEND_INTERNAL_URL=http://server:4000
export function getBackendInternalUrl(): string {
  return process.env.BACKEND_INTERNAL_URL || 'http://localhost:4000';
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

// WebSocket base (socket.io) for client connections
// Prefer explicit env vars; otherwise derive from window location with a dev port fallback.
export function getWebSocketBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_WS_URL;
  if (fromEnv) return fromEnv;

  if (!isServer && typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    const backendPort = port === '3000' ? '4000' : port;
    const portSuffix = backendPort ? `:${backendPort}` : '';
    return `${protocol}//${hostname}${portSuffix}`;
  }

  return 'http://localhost:4000';
}
