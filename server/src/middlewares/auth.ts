// middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@/utils/auth";
import { isUserBanned } from "@/lib/banHelpers";
import { db, schema } from "@/db/index";
import { eq } from "drizzle-orm";
import * as Sentry from "@sentry/node";

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: any;
            session: any;
        }
    }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers)});
    const userIP: string = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || ''; 

    if (!session) {
        // Allow bots and crawlers to access for metadata purposes
        const userAgent = req.headers['user-agent'] || '';
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
        Sentry.setUser(null);
        if (!isBot) return res.status(401).json({ message: "Unauthorized" });
        
    } else {
        const user = session.user as {
            id: string;
            email: string;
            name: string;
            banned?: boolean | null;
            banReason?: string | null;
            banExpires?: Date | string | null;
        };

        if (isUserBanned(user)) {
            Sentry.setUser(null);
            return res.status(403).json({
                message: user.banReason || "Your account has been suspended. Contact support if you believe this is an error.",
                code: "BANNED",
                banReason: user.banReason ?? null,
                banExpires: user.banExpires ?? null,
            });
        }

        // Clear expired ban flags if still marked banned in DB
        if (user.banned && user.banExpires && new Date(user.banExpires) <= new Date()) {
            await db
                .update(schema.user)
                .set({ banned: false, banReason: null, banExpires: null, updatedAt: new Date() })
                .where(eq(schema.user.id, user.id));
        }

        // Attach session to request for use in controllers
        req.user = session.user;
        req.session = session.session;

        Sentry.setUser({
            id: session.user.id,
            email: session.user.email,
            username: (session.user as { username?: string }).username || session.user.name,
            ip_address: userIP,
        });

    }
    
    next();
};