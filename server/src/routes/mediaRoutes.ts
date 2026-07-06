import express, { RequestHandler } from 'express';
import { redirectAvatar, redirectSticker } from '@/controllers/mediaController';
import { mediaRedirectRateLimit } from '@/middlewares/userActionRateLimit';

const router = express.Router();

// Public, no auth: stable avatar/sticker paths that 302 to a fresh presigned URL.
router.get('/avatar/:userId/:file', mediaRedirectRateLimit, redirectAvatar as RequestHandler);
router.get('/sticker/:file', mediaRedirectRateLimit, redirectSticker as RequestHandler);

export default router;
