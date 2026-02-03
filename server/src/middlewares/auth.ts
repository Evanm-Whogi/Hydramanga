// middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@/utils/auth";
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
        // Attach session to request for use in controllers
        req.user = session.user;
        req.session = session.session;

        Sentry.setUser({
            id: session.user.id,
            email: session.user.email,
            username: session.user.name,
            ip_address: userIP,
        });

    }
    
    next();
};