import { authClient } from '@/lib/auth';

type AuthUser = typeof authClient.$Infer.Session.user;

export function sanitizeReturnTo(value: string | null | undefined): string | null {
    if (!value || typeof value !== 'string') return null;
    if (!value.startsWith('/') || value.startsWith('//')) return null;
    if (value.startsWith('/login') || value.startsWith('/register') || value.startsWith('/reset-password')) return null;
    return value;
}

export function buildLoginUrl(returnTo?: string): string {
    const safeReturnTo = sanitizeReturnTo(returnTo);
    if (!safeReturnTo) return '/login';
    return `/login?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

export function redirectToLogin(returnTo?: string): void {
    if (typeof window === 'undefined') return;
    window.location.href = buildLoginUrl(returnTo ?? window.location.pathname);
}

export function requireAuth(user: AuthUser | null | undefined, returnTo?: string): user is AuthUser {
    if (user) return true;
    redirectToLogin(returnTo);
    return false;
}
