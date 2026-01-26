import { Router, RequestHandler } from 'express';
import getHomePage from '@/controllers/homeController';
import getIndexPage from '@/controllers/indexController';
import { authMiddleware } from '@/middlewares/auth';

const router = Router();

// Home aggregator - requires authentication
router.get('/home', authMiddleware, getHomePage as RequestHandler);

// Index aggregator - public
router.get('/index', getIndexPage as RequestHandler);

export default router;
