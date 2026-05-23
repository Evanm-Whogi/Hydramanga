import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
dotenv.config();

type RequireRoleMiddleware = (req: Request, res: Response, next: NextFunction) => void;

export function requireRole(role: string) : RequireRoleMiddleware {
    return function(req: Request, res: Response, next: NextFunction) {
        const user = req.user as any;

        if (!user || user.role !== role) {
            return res.status(403).json({ message: `Forbidden: ${role} Role Required` });
        }

        next();
    };
}