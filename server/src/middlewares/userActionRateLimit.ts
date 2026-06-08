import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';
import logger from '@/services/loggerService';
import { rateLimitPresets, type RateLimitPreset } from '@/config/rateLimitConfig';

function userKey(req: Request): string {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (userId) return `user:${userId}`;
  const ip = req.ip;
  return ip ? `ip:${ipKeyGenerator(ip)}` : 'ip:unknown';
}

function retryAfterMsFromRequest(req: Request, fallbackWindowMs: number): number {
  const resetTime = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
  if (resetTime instanceof Date) {
    return Math.max(1000, resetTime.getTime() - Date.now());
  }
  return Math.max(1000, fallbackWindowMs);
}

function createUserActionLimiter(preset: RateLimitPreset) {
  const { message, windowMs, max } = preset;
  const options: Partial<Options> = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userKey,
    handler: (req, res) => {
      logger.warn(`User action rate limit: ${userKey(req as Request)}`, {
        service: 'userActionRateLimit',
        path: req.path,
      });
      res.status(429).json({
        message,
        retryAfterMs: retryAfterMsFromRequest(req as Request, windowMs),
      });
    },
  };
  return rateLimit(options);
}

export const listWriteRateLimit = createUserActionLimiter(rateLimitPresets.listWrite);
const mangaSearchRateLimitMiddleware = createUserActionLimiter(rateLimitPresets.mangaSearch);

function hasTitleSearchQuery(req: Request): boolean {
  const search = req.query.search;
  if (search == null) return false;
  const value = Array.isArray(search) ? search[0] : search;
  return typeof value === 'string' && value.trim().length > 0;
}

/** Rate limit GET /manga/search only when `search` query is present (discover scroll/filter pagination is exempt). */
export const mangaSearchRateLimit: RequestHandler = (req, res, next) => {
  if (!hasTitleSearchQuery(req)) return next();
  return mangaSearchRateLimitMiddleware(req, res, next);
};
export const chatMessageRateLimit = createUserActionLimiter(rateLimitPresets.chatMessage);
export const chatMutationRateLimit = createUserActionLimiter(rateLimitPresets.chatMutation);
export const boardPostRateLimit = createUserActionLimiter(rateLimitPresets.boardPost);
export const boardReplyRateLimit = createUserActionLimiter(rateLimitPresets.boardReply);
export const boardMutationRateLimit = createUserActionLimiter(rateLimitPresets.boardMutation);
export const boardVoteRateLimit = createUserActionLimiter(rateLimitPresets.boardVote);
export const listVoteRateLimit = createUserActionLimiter(rateLimitPresets.listVote);
export const listViewTrackRateLimit = createUserActionLimiter(rateLimitPresets.listViewTrack);
export const listCommentCreateRateLimit = createUserActionLimiter(rateLimitPresets.listCommentCreate);
export const commentCreateRateLimit = createUserActionLimiter(rateLimitPresets.commentCreate);
export const commentMutationRateLimit = createUserActionLimiter(rateLimitPresets.commentMutation);
export const reviewCreateRateLimit = createUserActionLimiter(rateLimitPresets.reviewCreate);
export const reviewMutationRateLimit = createUserActionLimiter(rateLimitPresets.reviewMutation);
export const settingsPatchRateLimit = createUserActionLimiter(rateLimitPresets.settingsPatch);
export const profilePictureRateLimit = createUserActionLimiter(rateLimitPresets.profilePicture);
export const dataExportRateLimit = createUserActionLimiter(rateLimitPresets.dataExport);
export const dataImportRateLimit = createUserActionLimiter(rateLimitPresets.dataImport);
export const importRequestRateLimit = createUserActionLimiter(rateLimitPresets.importRequest);
export const progressDestructiveRateLimit = createUserActionLimiter(rateLimitPresets.progressDestructive);
export const bookmarkRateLimit = createUserActionLimiter(rateLimitPresets.bookmark);
