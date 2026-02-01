// middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@/utils/auth";

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
        
        if (!isBot) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        // Bots are allowed to continue without a session
    } else {
        // Attach session to request for use in controllers
        req.user = session.user;
        req.session = session.session;
    }
    
    next();
};