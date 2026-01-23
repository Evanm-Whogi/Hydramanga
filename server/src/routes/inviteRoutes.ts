import { Router, RequestHandler } from 'express';
import { generateInviteCode, getUserInviteCodes, validateInviteCode, useInviteCode } from '@/controllers/inviteController';
import { authMiddleware } from '@/middlewares/auth';

const router = Router();

// Authenticated invite management (requires req.user)
router.post('/generate', authMiddleware, generateInviteCode as RequestHandler);
router.get('/', authMiddleware, getUserInviteCodes as RequestHandler);

// Public validation / consumption
router.post('/validate', validateInviteCode as RequestHandler);
router.post('/use', useInviteCode as RequestHandler);

export default router;
