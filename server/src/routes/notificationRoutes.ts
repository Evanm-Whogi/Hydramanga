import { Router, RequestHandler } from 'express';
import {listNotifications, dismissNotification, clearAllNotifications} from '@/controllers/notificationController';

const router = Router();

router.get('/', listNotifications as RequestHandler);
router.delete('/', clearAllNotifications as RequestHandler);
router.delete('/:id', dismissNotification as RequestHandler);

export default router;
