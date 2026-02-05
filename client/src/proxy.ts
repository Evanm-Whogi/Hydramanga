import { NextResponse, type NextRequest } from "next/server";

export default async function proxy(request: NextRequest) {
    // Accept all common Better Auth cookie names (secure/host variants)
    const sessionToken =
        request.cookies.get("better-auth.session_token")?.value ||
        request.cookies.get("__Secure-better-auth.session_token")?.value ||
        request.cookies.get("__Host-better-auth.session_token")?.value;
    
    const protectedPaths = ["/announcements", "/discover", "/home", "/manga", "/profile", "/lists", "/history", "/manga/:slug", "/manga/:id/read/:slug"];
    // Use more precise path matching: exact match or match with / following the path
    const pathname = request.nextUrl.pathname;
    const isProtectedRoute = protectedPaths.some(path => 
        pathname === path || pathname.startsWith(path + "/")
    );

    if (isProtectedRoute && !sessionToken) {
        // Allow bots and crawlers to access pages for metadata/SEO purposes
        const userAgent = request.headers.get('user-agent') || '';
        const botUserAgents = [
            'googlebot',
            'bingbot',
            'slurp',
            'duckduckbot',
            'baiduspider',
            'yandexbot',
            'facebookexternalhit',
            'twitterbot',
            'linkedinbot',
            'whatsapp',
            'telegram',
            'discordbot',
            'slackbot',
            'curl',
            'wget',
        ];
        
        const isBot = botUserAgents.some(bot => userAgent.toLowerCase().includes(bot));
        
        if (!isBot) {
            return NextResponse.redirect(new URL("/login", request.url));
        }
    }

    return NextResponse.next();
}