import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import type { Request } from 'express';
import logger from '@/services/loggerService';

function userKey(req: Request): string {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (userId) return `user:${userId}`;
  const ip = req.ip;
  return ip ? `ip:${ipKeyGenerator(ip)}` : 'ip:unknown';
}

function createUserActionLimiter(message: string, windowMs: number, max: number) {
  const options: Partial<Options> = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userKey,
    handler: (req, res, _next, opts) => {
      const retryAfterSec = Math.max(1, Math.ceil((opts.windowMs ?? windowMs) / 1000));
      logger.warn(`User action rate limit: ${userKey(req as Request)}`, {
        service: 'userActionRateLimit',
        path: req.path,
      });
      res.status(429).json({
        message,
        retryAfterMs: retryAfterSec * 1000,
      });
    },
  };
  return rateLimit(options);
}

/** Chat messages */
export const chatMessageRateLimit = createUserActionLimiter(
  'You are sending messages too quickly. Please wait before sending another.',
  60 * 1000, // 1 minute
  15 // 15 messages per minute
);

/** Board new posts */
export const boardPostRateLimit = createUserActionLimiter(
  'You are posting too quickly. Please wait before creating another thread.',
  10 * 60 * 1000, // 10 minutes
  5 // 5 posts per 10 minutes
);

/** Board replies */
export const boardReplyRateLimit = createUserActionLimiter(
  'You are replying too quickly. Please wait before posting another reply.',
  5 * 60 * 1000, // 5 minutes
  10 // 10 replies per 5 minutes
);

/** Manga comments and replies */
export const commentCreateRateLimit = createUserActionLimiter(
  'You are commenting too quickly. Please wait before posting again.',
  5 * 60 * 1000, // 5 minutes
  10 // 10 comments per 5 minutes
);

/** Manga reviews (ratings) */
export const reviewCreateRateLimit = createUserActionLimiter(
  'You are submitting reviews too quickly. Please wait before posting another.',
  30 * 60 * 1000, // 30 minutes
  10 // 10 reviews per 30 minutes
);
