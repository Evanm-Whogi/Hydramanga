import { NextResponse, type NextRequest } from "next/server";
import { getCookieCache, getSessionCookie } from "better-auth/cookies";

const AUTH_SECRET = process.env.BETTER_AUTH_SECRET;

if (!AUTH_SECRET) {
    throw new Error(
        "BETTER_AUTH_SECRET is required for proxy auth checks (signed cookie cache)."
    );
}

const GUEST_PATHS = ["/login", "/register", "/reset-password"] as const;

const PROTECTED_PATHS = [
    "/admin",
    "/profile",
    "/history",
    "/request",
] as const;

type UserRole = "admin" | "user" | "moderator" | string;

type CachedAuth = {
    /** True when the signed cookie cache verified a user (cryptographic check). */
    verified: boolean;
    role: UserRole | null;
};

function matchesPath(pathname: string, paths: readonly string[]): boolean {
    return paths.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`)
    );
}

function isUsersMePath(pathname: string): boolean {
    return pathname === "/users/me" || pathname.startsWith("/users/me/");
}

export function requiresAuth(pathname: string): boolean {
    if (matchesPath(pathname, PROTECTED_PATHS)) return true;
    if (isUsersMePath(pathname)) return true;
    // The manga reader (/manga/:id/read/:chapter) is intentionally NOT gated here.
    // Whether guests can read is controlled by the `guestReadingEnabled` site setting,
    // which the middleware cannot read without a backend call. The reader page (a
    // server component) enforces it: it redirects guests to /login when guest reading
    // is disabled and renders for everyone when it is enabled.
    return false;
}

function hasSessionToken(request: NextRequest): boolean {
    return Boolean(getSessionCookie(request));
}

/** Single signed-cache read per request — no backend HTTP. */
async function getCachedAuth(request: NextRequest): Promise<CachedAuth> {
    try {
        const cached = await getCookieCache(request, { secret: AUTH_SECRET });
        const user = cached?.user as { role?: UserRole | null } | undefined;

        if (!user) {
            return { verified: false, role: null };
        }

        return {
            verified: true,
            role: user.role ?? null,
        };
    } catch {
        return { verified: false, role: null };
    }
}

function buildLoginRedirect(request: NextRequest, pathname: string): NextResponse {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
}

/**
 * UX redirects only — not the security boundary.
 * Real validation: admin/layout.tsx (server getSession) + Express authMiddleware.
 */
export default async function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    const isGuestRoute = matchesPath(pathname, GUEST_PATHS);
    const isAdminRoute =
        pathname === "/admin" || pathname.startsWith("/admin/");
    const isProtectedRoute = requiresAuth(pathname);

    if (!isGuestRoute && !isAdminRoute && !isProtectedRoute) {
        return NextResponse.next();
    }

    const hasSession = hasSessionToken(request);

    if (!hasSession) {
        if (isProtectedRoute || isAdminRoute) {
            return buildLoginRedirect(request, pathname);
        }
        return NextResponse.next();
    }

    const auth = await getCachedAuth(request);

    if (isGuestRoute) {
        if (auth.verified || hasSession) {
            return NextResponse.redirect(new URL("/", request.url));
        }
        return NextResponse.next();
    }

    if (isAdminRoute) {
        if (auth.verified && auth.role !== "admin") {
            return NextResponse.redirect(new URL("/", request.url));
        }
        return NextResponse.next();
    }

    if (isProtectedRoute) {
        return NextResponse.next();
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
