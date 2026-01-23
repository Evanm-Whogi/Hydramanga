import { Express } from 'express';
import { authMiddleware } from '@/middlewares/auth';
import { trackingMiddleware } from '@/middlewares/tracking';

// Route modules
import mangaRoutes from '@/routes/mangaRoutes';
import progressRoutes from '@/routes/progressRoutes';
import analyticsRoutes from '@/routes/analyticsRoutes';
import commentRoutes from '@/routes/commentRoutes';
import announcementRoutes from '@/routes/announcementRoutes';
import inviteRoutes from '@/routes/inviteRoutes';
import adminRoutes from '@/routes/adminRoutes';
import pageRoutes from '@/routes/pageRoutes';

module.exports = (app: Express) => {
    // Apply tracking middleware globally to track views
    app.use(trackingMiddleware);

    // Manga and Progress Routes
    app.use('/manga', authMiddleware, mangaRoutes);
    app.use('/manga/progress', authMiddleware, progressRoutes);

    // Analytics Routes
    app.use('/analytics', authMiddleware, analyticsRoutes);

    // User Progress Routes (legacy, now under analytics)
    app.use('/progress', authMiddleware, analyticsRoutes);

    // Content Routes
    app.use('/comments', authMiddleware, commentRoutes);
    app.use('/announcements', authMiddleware, announcementRoutes);
    app.use('/invites', inviteRoutes); // Some endpoints don't require auth (validate, use)

    // Page Aggregator Routes
    app.use('/', authMiddleware, pageRoutes); 

    // Admin Routes
    app.use('/admin', authMiddleware, adminRoutes);
};
