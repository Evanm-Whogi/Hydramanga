import { Express, RequestHandler } from 'express';
import mangaRoutes from'@/routes/mangaRoutes';
import progressRoutes from '@/routes/progressRoutes';
import { authMiddleware } from '@/middlewares/auth';
import { trackingMiddleware } from '@/middlewares/tracking';

// Controllers
import { createComment, deleteComment, fetchComments, likeComment } from '@/controllers/commentController';
import { fetchAnnouncements, createAnnouncement } from '@/controllers/announcementController';
import { importStatus, triggerMangaSync } from '@/controllers/mangaImportController';
import { fetchChaptersWeebCentral } from '@/controllers/mangaController'; // Part of testing suite
import { getTrending, getMangaAnalytics, getMyProgress, getMangaProgress, updateProgress, deleteProgress,getMyStats} from '@/controllers/analyticsController';
import { generateInviteCode, getUserInviteCodes, validateInviteCode, useInviteCode } from '@/controllers/inviteController';

// Aggregator Controllers
import getHomePage from '@/controllers/homeController';
import getIndexPage from '@/controllers/indexController';


module.exports = (app: Express) => {
    // Apply tracking middleware globally to track views
    app.use(trackingMiddleware);

    // Groups
    app.use('/manga', authMiddleware, mangaRoutes)
    app.use('/manga/progress', authMiddleware, progressRoutes)

    // Analytics Routes
    app.get('/analytics/trending', authMiddleware, getTrending as RequestHandler);
    app.get('/analytics/manga/:id', authMiddleware, getMangaAnalytics as RequestHandler);

    // Progress Routes (require authentication)
    app.get('/progress', authMiddleware, getMyProgress as RequestHandler);
    app.get('/progress/manga/:id', authMiddleware, getMangaProgress as RequestHandler);
    app.post('/progress', authMiddleware, updateProgress as RequestHandler);
    app.delete('/progress/manga/:id', authMiddleware, deleteProgress as RequestHandler);
    app.get('/progress/stats', authMiddleware, getMyStats as RequestHandler);

    // Announcement Routes
    app.get('/announcements', authMiddleware, fetchAnnouncements as RequestHandler);
    app.post('/announcements', authMiddleware, createAnnouncement as RequestHandler);

    // Comment Routes
    app.get('/comments', authMiddleware, fetchComments as RequestHandler);
    app.post('/comments', authMiddleware, createComment as RequestHandler);
    app.post('/comments/like', authMiddleware, likeComment as RequestHandler);
    app.delete('/comments/:commentId', authMiddleware, deleteComment as RequestHandler);

    // Invite Routes
    app.post('/invites/generate', authMiddleware, generateInviteCode as RequestHandler);
    app.get('/invites', authMiddleware, getUserInviteCodes as RequestHandler);
    app.post('/invites/validate', validateInviteCode as RequestHandler);
    app.post('/invites/use', useInviteCode as RequestHandler);

    // Page Routes
    app.get('/home', authMiddleware, getHomePage as RequestHandler); // Aggregator
    app.get('/index', getIndexPage as RequestHandler); // Aggregator


    // Admin Routes
    app.get('/admin/import-status', authMiddleware, importStatus as RequestHandler);
    app.get('/admin/manga/sync', authMiddleware, triggerMangaSync as RequestHandler);
    app.get('/heartbeat', (req, res) => {
        res.json({status: 200, message: `Service is healthy`});
    });

}