import { Request, Response, NextFunction } from "express";
import { attachAuthSessionToRequest, checkAndClearBan, clearSentryUser, getClientIp, resolveAuthSession } from "@/middlewares/sessionHelpers";

export const optionalAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const resolved = await resolveAuthSession(req);
    if (!resolved) {
        clearSentryUser();
        return next();
    }

    const banResult = await checkAndClearBan(resolved.user);
    if (!banResult.ok) {
        clearSentryUser();
        return res.status(banResult.status).json(banResult.body);
    }

    await attachAuthSessionToRequest(req, resolved, getClientIp(req));
    next();
};
