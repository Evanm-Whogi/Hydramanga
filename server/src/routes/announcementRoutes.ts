import { Router, RequestHandler } from 'express';
import { fetchAnnouncements, createAnnouncement } from '@/controllers/announcementController';

const router = Router();

router.get('/', fetchAnnouncements as RequestHandler);
router.post('/', createAnnouncement as RequestHandler);

export default router;
