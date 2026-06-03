import { Express, RequestHandler } from 'express';
import { authMiddleware } from '@/middlewares/auth';
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
import listRoutes from '@/routes/listRoutes';
import contactRoutes from '@/routes/contactRoutes';
import userRoutes from '@/routes/userRoutes';
import importRequestRoutes from '@/routes/importRequestRoutes';
import leaderboardRoutes from '@/routes/leaderboardRoutes';
import boardRoutes from '@/routes/boardRoutes';
import chatRoutes from '@/routes/chatRoutes';
import notificationRoutes from '@/routes/notificationRoutes';
import { getPublicSiteSettings } from '@/controllers/siteSettingsController';


module.exports = (app: Express) => {

    // Apply tracking middleware globally to track views
    app.use(trackingMiddleware);

    // User Routes (profile pictures)
    app.use('/users', authMiddleware, userRoutes);

    app.use('/manga', authMiddleware, mangaRoutes);
    app.use('/manga/progress', authMiddleware, progressRoutes);

    // List Management Routes
    app.use('/lists', authMiddleware, listRoutes);

    // Public read-only analytics (no auth — avoids session DB writes on manga page polls)
    app.get('/analytics/trending', getTrending as RequestHandler);
    app.get('/analytics/manga/:id', getMangaAnalytics as RequestHandler);

    // Analytics Routes (authenticated)
    app.use('/analytics', authMiddleware, analyticsRoutes);

    // User Progress Routes (legacy, now under analytics)
    app.use('/progress', authMiddleware, analyticsRoutes);

    // Content Routes
    app.use('/comments', authMiddleware, commentRoutes);
    app.use('/reviews', authMiddleware, reviewRoutes);
    app.use('/announcements', authMiddleware, announcementRoutes);
    app.use('/notifications', authMiddleware, notificationRoutes);

    // Contact and DMCA Routes (public)
    app.use('/', contactRoutes);

    // Page Aggregator Routes
    app.use('/', pageRoutes); 

    // Import requests (user)
    app.use('/import-requests', authMiddleware, importRequestRoutes);

    // Community
    app.use('/leaderboard', authMiddleware, leaderboardRoutes);
    app.use('/board', authMiddleware, boardRoutes);
    app.use('/chat', authMiddleware, chatRoutes);

    // Admin Routes
    app.use('/admin', authMiddleware, adminRoutes);

    // Public Endpoints
    app.get('/heartbeat', (req, res) => {
        res.json({ status: 200, message: 'Service is healthy' });
    });

    app.get('/site-settings', getPublicSiteSettings as RequestHandler);
};
