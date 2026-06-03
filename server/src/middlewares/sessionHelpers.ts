import { Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@/utils/auth";
import { isUserBanned } from "@/lib/banHelpers";
import { shouldTouchSession } from "@/lib/sessionTouchCache";
import { db, schema } from "@/db/index";
import { eq } from "drizzle-orm";
import * as Sentry from "@sentry/node";

type AuthUser = {
    id: string;
    email: string;
    name: string;
    banned?: boolean | null;
    banReason?: string | null;
    banExpires?: Date | string | null;
    username?: string;
    role?: string;
};

export type ResolvedAuthSession = {
    user: AuthUser;
    session: { id?: string; [key: string]: unknown };
};

export function getClientIp(req: Request): string {
    return (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
}

export async function resolveAuthSession(req: Request): Promise<ResolvedAuthSession | null> {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session?.user) return null;
    return { user: session.user as AuthUser, session: session.session as ResolvedAuthSession['session'] };
}

export type BanCheckResult = { ok: true } | { ok: false; status: 403; body: Record<string, unknown> };

export async function checkAndClearBan(user: AuthUser): Promise<BanCheckResult> {
    if (isUserBanned(user)) {
        return {
            ok: false,
            status: 403,
            body: {
                message: user.banReason || "Your account has been suspended. Contact support if you believe this is an error.",
                code: "BANNED",
                banReason: user.banReason ?? null,
                banExpires: user.banExpires ?? null,
            },
        };
    }

    if (user.banned && user.banExpires && new Date(user.banExpires) <= new Date()) {
        await db
            .update(schema.user)
            .set({ banned: false, banReason: null, banExpires: null, updatedAt: new Date() })
            .where(eq(schema.user.id, user.id));
    }

    return { ok: true };
}

export async function attachAuthSessionToRequest(req: Request, resolved: ResolvedAuthSession, userIP: string): Promise<void> {
    req.user = resolved.user as typeof req.user;
    req.session = resolved.session as typeof req.session;

    const trackingData = (req as Request & { trackingData?: { ipAddress: string; userAgent: string; userId?: string } }).trackingData;
    if (trackingData) {
        trackingData.userId = resolved.user.id;
    }

    if (resolved.session?.id && shouldTouchSession(resolved.session.id)) {
        await db
            .update(schema.session)
            .set({ updatedAt: new Date() })
            .where(eq(schema.session.id, resolved.session.id));
    }

    Sentry.setUser({
        id: resolved.user.id,
        email: resolved.user.email,
        username: resolved.user.username || resolved.user.name,
        ip_address: userIP,
    });
}

export function clearSentryUser(): void {
    Sentry.setUser(null);
}
