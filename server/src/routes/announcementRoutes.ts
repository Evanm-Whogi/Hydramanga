import { Router, RequestHandler } from 'express';
import { fetchAnnouncements, createAnnouncement } from '@/controllers/announcementController';
import { requireRole } from '@/middlewares/requireRole';

const router = Router();

router.get('/', fetchAnnouncements as RequestHandler);
router.post('/', requireRole('admin'), createAnnouncement as RequestHandler);

export default router;
