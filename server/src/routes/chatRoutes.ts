import { Router, RequestHandler } from 'express';
import { authMiddleware } from '@/middlewares/auth';
import { requireRole } from '@/middlewares/requireRole';
import { chatMessageRateLimit } from '@/middlewares/userActionRateLimit';
import { getChatMessages, postChatMessage, deleteChatMessage, updateChatMessage, muteChatUser, unmuteChatUser } from '@/controllers/chatController';

const router = Router();

router.get('/messages', getChatMessages as RequestHandler);
router.post('/messages', authMiddleware, chatMessageRateLimit, postChatMessage as RequestHandler);
router.patch('/messages/:messageId', authMiddleware, updateChatMessage as RequestHandler);
router.delete('/messages/:messageId', authMiddleware, deleteChatMessage as RequestHandler);
router.post('/moderation/mute', authMiddleware, requireRole('admin'), muteChatUser as RequestHandler);
router.post('/moderation/unmute', authMiddleware, requireRole('admin'), unmuteChatUser as RequestHandler);

export default router;
