import express, { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { getMangaMetadata } from '@/controllers/mangaController';
import { getHomeMetadata } from '@/controllers/metadataController';

const router = express.Router();

// Rate limiting for metadata endpoints to prevent abuse by bots/crawlers
// 100 requests per 15 minutes per IP
const metadataLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 100,  // Max 100 requests per window
    message: 'Too many metadata requests from this IP',
    standardHeaders: true,  // Include rate limit info in headers
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for internal requests (localhost)
        return req.ip === '127.0.0.1' || req.ip === '::1';
    }
});

// Metadata endpoints - public, no authentication required
// Used for generating Open Graph tags for social media previews
// Bots and crawlers can use these without logging in

// Manga metadata (title, description, cover for preview)
router.get('/manga/:id', metadataLimiter, getMangaMetadata as RequestHandler);

// Home page metadata (trending and popular manga)
router.get('/home', metadataLimiter, getHomeMetadata as RequestHandler);

export default router;
