import { Express } from 'express';
import { authMiddleware } from '@/middlewares/auth';
import { trackingMiddleware } from '@/middlewares/tracking';

// Route modules
import mangaRoutes from '@/routes/mangaRoutes';
import metadataRoutes from '@/routes/metadataRoutes';
import progressRoutes from '@/routes/progressRoutes';
import analyticsRoutes from '@/routes/analyticsRoutes';
import commentRoutes from '@/routes/commentRoutes';
import announcementRoutes from '@/routes/announcementRoutes';
import inviteRoutes from '@/routes/inviteRoutes';
import adminRoutes from '@/routes/adminRoutes';
import pageRoutes from '@/routes/pageRoutes';
import listRoutes from '@/routes/listRoutes';

module.exports = (app: Express) => {
    // Apply tracking middleware globally to track views
    app.use(trackingMiddleware);

    // Metadata routes (public - for SEO and social media previews)
    // No authentication required, but still protected by bot detection in proxy/auth middleware
    app.use('/metadata', metadataRoutes);

    // Manga and Progress Routes
    app.use('/manga', authMiddleware, mangaRoutes);
    app.use('/manga/progress', authMiddleware, progressRoutes);

    // List Management Routes
    app.use('/lists', authMiddleware, listRoutes);

    // Analytics Routes
    app.use('/analytics', authMiddleware, analyticsRoutes);

    // User Progress Routes (legacy, now under analytics)
    app.use('/progress', authMiddleware, analyticsRoutes);

    // Content Routes
    app.use('/comments', authMiddleware, commentRoutes);
    app.use('/announcements', authMiddleware, announcementRoutes);
    app.use('/invites', inviteRoutes); // Some endpoints don't require auth (validate, use)

    // Page Aggregator Routes
    app.use('/', pageRoutes); 

    // Admin Routes
    app.use('/admin', authMiddleware, adminRoutes);
};
