import { Express, RequestHandler } from 'express';
import { authMiddleware } from '@/middlewares/auth';
import { optionalAuthMiddleware } from '@/middlewares/optionalAuth';
import { trackingMiddleware } from '@/middlewares/tracking';
import { getMangaAnalytics, getTrending } from '@/controllers/analyticsController';

// Route modules
import mangaRoutes from '@/routes/mangaRoutes';
import progressRoutes from '@/routes/progressRoutes';
import analyticsRoutes from '@/routes/analyticsRoutes';
import commentRoutes from '@/routes/commentRoutes';
import reviewRoutes from '@/routes/reviewRoutes';
import announcementRoutes from '@/routes/announcementRoutes';
import adminRoutes from '@/routes/adminRoutes';
import pageRoutes from '@/routes/pageRoutes';
import bookmarkRoutes from '@/routes/bookmarkRoutes';
import curatedListRoutes from '@/routes/curatedListRoutes';
import contactRoutes from '@/routes/contactRoutes';
import userRoutes from '@/routes/userRoutes';
import importRequestRoutes from '@/routes/importRequestRoutes';
import leaderboardRoutes from '@/routes/leaderboardRoutes';
import boardRoutes from '@/routes/boardRoutes';
import chatRoutes from '@/routes/chatRoutes';
import notificationRoutes from '@/routes/notificationRoutes';
import { getPublicSiteSettings } from '@/controllers/siteSettingsController';
import contentImageRoutes from '@/routes/contentImageRoutes';
import stickerRoutes from '@/routes/stickerRoutes';


module.exports = (app: Express) => {

    // Apply tracking middleware globally to track views
    app.use(trackingMiddleware);

    app.use('/users', optionalAuthMiddleware, userRoutes);

    app.use('/manga', optionalAuthMiddleware, mangaRoutes);
    app.use('/manga/progress', authMiddleware, progressRoutes);

    app.use('/bookmarks', authMiddleware, bookmarkRoutes);
    app.use('/lists', curatedListRoutes);

    app.get('/analytics/trending', getTrending as RequestHandler);
    app.get('/analytics/manga/:id', getMangaAnalytics as RequestHandler);

    app.use('/analytics', authMiddleware, analyticsRoutes);

    app.use('/progress', authMiddleware, analyticsRoutes);

    app.use('/comments', optionalAuthMiddleware, commentRoutes);
    app.use('/reviews', optionalAuthMiddleware, reviewRoutes);
    app.use('/announcements', optionalAuthMiddleware, announcementRoutes);
    app.use('/notifications', authMiddleware, notificationRoutes);

    app.use('/', contactRoutes);

    app.use('/', optionalAuthMiddleware, pageRoutes);

    app.use('/import-requests', authMiddleware, importRequestRoutes);

    app.use('/leaderboard', optionalAuthMiddleware, leaderboardRoutes);
    app.use('/board', optionalAuthMiddleware, boardRoutes);
    app.use('/chat', optionalAuthMiddleware, chatRoutes);

    app.use('/admin', authMiddleware, adminRoutes);

    app.get('/heartbeat', (req, res) => {
        res.json({ status: 200, message: 'Service is healthy' });
    });

    app.get('/site-settings', getPublicSiteSettings as RequestHandler);
    app.use('/content-images', contentImageRoutes);
    app.use('/stickers', stickerRoutes);
};
