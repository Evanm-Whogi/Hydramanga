import { Express, RequestHandler } from 'express';
import authRoutes from '@/routes/userRoutes';
import mangaRoutes from'@/routes/mangaRoutes';

import { importStatus } from '@/controllers/mangaImportController';
import { triggerMangaSync } from '@/controllers/mangaImportController';
import getHomePage from '@/controllers/homeController';
import getIndexPage from '@/controllers/indexController';
import { fetchAnnouncements, createAnnouncement } from '@/controllers/announcementController';

import { authMiddleware } from '@/middlewares/auth';
import { createComment, deleteComment, fetchComments, likeComment } from '@/controllers/commentController';

import { fetchChaptersWeebCentral } from '@/controllers/mangaController';

module.exports = (app: Express) => {
    // Groups
    app.use('/user', authMiddleware, authRoutes);
    app.use('/manga', mangaRoutes)

    // Announcement Routes
    app.get('/announcements', authMiddleware, fetchAnnouncements as RequestHandler);
    app.post('/announcements', authMiddleware, createAnnouncement as RequestHandler);

    // Comment Routes
    app.get('/comments', fetchComments as RequestHandler);
    app.post('/comments', createComment as RequestHandler);
    app.post('/comments/like', likeComment as RequestHandler);
    app.delete('/comments/:commentId', deleteComment as RequestHandler);

    // Page Routes
    app.get('/home', authMiddleware, getHomePage as RequestHandler); // Aggregator
    app.get('/index', getIndexPage as RequestHandler); // Aggregator


    app.get('/test', fetchChaptersWeebCentral as RequestHandler);

    // Admin Routes
    app.get('/import-status', importStatus as RequestHandler);
    app.post('/manga/sync', triggerMangaSync as RequestHandler);

    app.get('/heartbeat', (req, res) => {
        res.json({status: 200, message: `Service is healthy`});
    });

}