import { NextResponse, type NextRequest } from "next/server";

const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL || "http://localhost:4000";

const GUEST_PATHS = ["/login", "/register", "/reset-password"];

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
];

type SessionPayload = {
    user?: { role?: string | null };
} | null;

function matchesPath(pathname: string, paths: readonly string[]): boolean {
    return paths.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`)
    );
}

async function getSession(request: NextRequest): Promise<SessionPayload> {
    const cookie = request.headers.get("cookie");
    if (!cookie) return null;

    try {
        const res = await fetch(`${BACKEND_INTERNAL_URL}/auth/get-session`, {
            headers: { cookie },
            cache: "no-store",
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.user) return null;
        return data;
    } catch {
        return null;
    }
}

export default async function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    const isGuestRoute = matchesPath(pathname, GUEST_PATHS);
    const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
    const isProtectedRoute = matchesPath(pathname, PROTECTED_PATHS);

    if (isGuestRoute) {
        const session = await getSession(request);
        if (session?.user) {
            return NextResponse.redirect(new URL("/home", request.url));
        }
        return NextResponse.next();
    }

    if (isAdminRoute) {
        const session = await getSession(request);
        if (!session?.user) {
            return NextResponse.redirect(new URL("/login", request.url));
        }
        if (session.user.role !== "admin") {
            return NextResponse.redirect(new URL("/home", request.url));
        }
        return NextResponse.next();
    }

    if (isProtectedRoute) {
        const session = await getSession(request);
        if (!session?.user) {
            return NextResponse.redirect(new URL("/login", request.url));
        }
        return NextResponse.next();
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
    ],
};
