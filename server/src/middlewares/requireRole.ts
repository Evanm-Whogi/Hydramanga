import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq } from 'drizzle-orm';

type RequireRoleMiddleware = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function requireRole(role: string): RequireRoleMiddleware {
    return async function (req: Request, res: Response, next: NextFunction) {
        const sessionUser = req.user as { id?: string } | undefined;

        if (!sessionUser?.id) {
            res.status(403).json({ message: `Forbidden: ${role} Role Required` });
            return;
        }

        try {
            // Re-read the role from the DB so a revoked/demoted role takes effect
            // immediately instead of lingering until the session cookie expires.
            const [current] = await db
                .select({ role: schema.user.role })
                .from(schema.user)
                .where(eq(schema.user.id, sessionUser.id))
                .limit(1);

            if (!current || current.role !== role) {
                res.status(403).json({ message: `Forbidden: ${role} Role Required` });
                return;
            }

            next();
        } catch (err) {
            next(err);
        }
    };
}