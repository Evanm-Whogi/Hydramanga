import { NextResponse, type NextRequest } from "next/server";

export default async function proxy(request: NextRequest) {
    // Accept all common Better Auth cookie names (secure/host variants)
    const sessionToken =
        request.cookies.get("better-auth.session_token")?.value ||
        request.cookies.get("__Secure-better-auth.session_token")?.value ||
        request.cookies.get("__Host-better-auth.session_token")?.value;
    
    const protectedPaths = ["/announcements", "/discover", "/home", "/manga", "/profile", "/lists"];
    const isProtectedRoute = protectedPaths.some(path => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path + "/"));

    if (isProtectedRoute && !sessionToken) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
}