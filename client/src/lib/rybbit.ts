import { getUserDisplayName } from "@/lib/userDisplay";

export type RybbitTraits = Record<string, string | number | boolean | null>;
export type RybbitEventProperties = Record<string, string | number | boolean>;

const RYBBIT_POLL_MS = 100;
const RYBBIT_POLL_TIMEOUT_MS = 10_000;
const PENDING_OAUTH_REGISTER_KEY = "rybbit_pending_register";

export function whenRybbitReady(onReady: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const rybbit = window.rybbit;
  if (rybbit?.onReady) {
    rybbit.onReady(() => onReady());
    return () => {};
  }

  if (rybbit) {
    onReady();
    return () => {};
  }

  const startedAt = Date.now();
  const intervalId = window.setInterval(() => {
    if (window.rybbit) {
      window.clearInterval(intervalId);
      onReady();
      return;
    }

    if (Date.now() - startedAt >= RYBBIT_POLL_TIMEOUT_MS) {
      window.clearInterval(intervalId);
    }
  }, RYBBIT_POLL_MS);

  return () => window.clearInterval(intervalId);
}

export function trackRybbitEvent(eventName: string, properties?: RybbitEventProperties) {
  whenRybbitReady(() => {
    window.rybbit?.event?.(eventName, properties);
  });
}

export function markPendingOAuthRegister(provider: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_OAUTH_REGISTER_KEY, provider);
  } catch {
    /* ignore */
  }
}

export function consumePendingOAuthRegister(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const provider = sessionStorage.getItem(PENDING_OAUTH_REGISTER_KEY);
    if (provider) sessionStorage.removeItem(PENDING_OAUTH_REGISTER_KEY);
    return provider;
  } catch {
    return null;
  }
}

const RECENT_SIGNUP_WINDOW_MS = 5 * 60 * 1000;

export function isRecentSignup(createdAt: string | Date | undefined): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created < RECENT_SIGNUP_WINDOW_MS;
}

export function trackUserRegister(method: string) {
  trackRybbitEvent("User Register", { method });
}

type RybbitUser = {
  id: string;
  username?: string | null;
  displayUsername?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

export function buildRybbitTraits(user: RybbitUser): RybbitTraits {
  const traits: RybbitTraits = {
    username: user.displayUsername || user.username || getUserDisplayName(user),
  };

  if (user.name) traits.name = user.name;
  if (user.email) traits.email = user.email;
  if (user.role) traits.role = user.role;

  return traits;
}

function getRybbit() {
  if (typeof window === "undefined") return null;
  return window.rybbit ?? null;
}

export function identifyRybbitUser(user: RybbitUser) {
  const rybbit = getRybbit();
  if (!rybbit) return;

  const traits = buildRybbitTraits(user);
  const hasTraits = Object.keys(traits).length > 0;

  if (hasTraits) {
    rybbit.identify(user.id, traits);
  } else {
    rybbit.identify(user.id);
  }
}

export function updateRybbitTraits(user: RybbitUser) {
  const rybbit = getRybbit();
  if (!rybbit) return;

  const currentUserId = rybbit.getUserId?.();
  if (currentUserId === user.id) {
    rybbit.setTraits?.(buildRybbitTraits(user));
    return;
  }

  identifyRybbitUser(user);
}

export function clearRybbitUser() {
  getRybbit()?.clearUserId?.();
}
