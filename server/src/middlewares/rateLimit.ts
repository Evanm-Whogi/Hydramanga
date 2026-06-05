import { rateLimit } from 'express-rate-limit';
import logger from '@/services/loggerService';
import { rateLimitPresets } from '@/config/rateLimitConfig';

// Brute-force protection for sensitive auth endpoints (sign-in, sign-up, password reset).
// Mounted only on those paths so high-frequency calls like get-session are unaffected.
export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // limit each IP to 20 sensitive auth attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    handler: (req: any, res: any) => {
        logger.warn(`Auth rate limit reached for IP: ${req.ip} [${req.headers['x-forwarded-for']}] path=${req.originalUrl}`);
        res.status(429).json({ message: 'Too many attempts. Please try again later.' });
    },
});

/** Public contact / DMCA / manga-report forms (spam protection). */
export const publicFormRateLimiter = rateLimit({
    windowMs: rateLimitPresets.publicForm.windowMs,
    max: rateLimitPresets.publicForm.max,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    handler: (req: any, res: any) => {
        const resetTime = req.rateLimit?.resetTime;
        const retryAfterMs = resetTime instanceof Date
            ? Math.max(1000, resetTime.getTime() - Date.now())
            : Math.max(1000, rateLimitPresets.publicForm.windowMs);
        logger.warn(`Public form rate limit for IP: ${req.ip} path=${req.originalUrl}`);
        res.status(429).json({
            message: rateLimitPresets.publicForm.message,
            retryAfterMs,
        });
    },
});
