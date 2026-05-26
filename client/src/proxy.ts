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
    "/announcements",
    "/discover",
    "/home",
    "/manga",
    "/profile",
    "/lists",
    "/history",
    "/leaderboard",
    "/board",
    "/chat",
    "/users",
    "/contact",
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

/**
 * UX redirects only — not the security boundary.
 * Real validation: admin/layout.tsx (server getSession) + Express authMiddleware.
 */
export default async function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    const isGuestRoute = matchesPath(pathname, GUEST_PATHS);
    const isAdminRoute =
        pathname === "/admin" || pathname.startsWith("/admin/");
    const isProtectedRoute = matchesPath(pathname, PROTECTED_PATHS);

    // Matcher is broad (static regex); skip auth logic on public routes.
    if (!isGuestRoute && !isAdminRoute && !isProtectedRoute) {
        return NextResponse.next();
    }

    const hasSession = hasSessionToken(request);

    // Fast path — no cookie at all.
    if (!hasSession) {
        if (isProtectedRoute || isAdminRoute) {
            return NextResponse.redirect(new URL("/login", request.url));
        }
        return NextResponse.next();
    }

    // One cache read for the rest of the request.
    const auth = await getCachedAuth(request);

    if (isGuestRoute) {
        if (auth.verified || hasSession) {
            return NextResponse.redirect(new URL("/home", request.url));
        }
        return NextResponse.next();
    }

    if (isAdminRoute) {
        // Fail closed when cache proves a non-admin user.
        if (auth.verified && auth.role !== "admin") {
            return NextResponse.redirect(new URL("/home", request.url));
        }
        // Token present but cache missing/stale → server layout validates via getSession.
        return NextResponse.next();
    }

    if (isProtectedRoute) {
        // Session cookie present; root layout validates with backend on render.
        return NextResponse.next();
    }

    return NextResponse.next();
}

// Static literal required by Next.js/Turbopack. Path lists above control which routes
// actually run auth logic; this regex only decides when the proxy function is invoked.
export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
