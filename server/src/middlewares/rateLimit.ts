import { rateLimit } from 'express-rate-limit';
import logger from '@/services/loggerService';

export const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
    headers: true,
    statusCode: 429,
    handler: (req: any, res: any) => { 
        logger.warn(`Rate limit reached for IP: ${req.ip} [${req.headers['x-forwarded-for']}]`); // x-forwarded-for is used when the server is behind a proxy (Cloudflare, Nginx, etc.)
        res.status(429).send('Too many requests from this IP, please try again after 15 minutes');
    },
});

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
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    handler: (req: any, res: any) => {
        logger.warn(`Public form rate limit for IP: ${req.ip} path=${req.originalUrl}`);
        res.status(429).json({ message: 'Too many submissions. Please try again later.' });
    },
});