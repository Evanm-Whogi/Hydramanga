import { Router, RequestHandler } from 'express';
import { requireRole } from '@/middlewares/requireRole';
import { chatMessageRateLimit } from '@/middlewares/userActionRateLimit';
import { getChatMessages, postChatMessage, deleteChatMessage, updateChatMessage, muteChatUser, unmuteChatUser } from '@/controllers/chatController';

const router = Router();

router.get('/messages', getChatMessages as RequestHandler);
router.post('/messages', chatMessageRateLimit, postChatMessage as RequestHandler);
router.patch('/messages/:messageId', updateChatMessage as RequestHandler);
router.delete('/messages/:messageId', deleteChatMessage as RequestHandler);
router.post('/moderation/mute', requireRole('admin'), muteChatUser as RequestHandler);
router.post('/moderation/unmute', requireRole('admin'), unmuteChatUser as RequestHandler);

export default router;
