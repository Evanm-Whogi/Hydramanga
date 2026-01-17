import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
dotenv.config();
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@/utils/auth";

export const me = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
    });
    
    if (!session) {
        return res.status(401).json({ user: null, session: null });
    }

    return res.json(session);
}