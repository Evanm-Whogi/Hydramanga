import { Router, RequestHandler } from 'express';
import { authMiddleware } from '@/middlewares/auth';
import { profilePictureUpload } from '@/config/multer';
import { uploadProfilePicture, deleteProfilePicture } from '@/controllers/userController';
import { getSettings, patchSettings } from '@/controllers/userSettingsController';
import { getPublicProfile } from '@/controllers/profileController';
import { listMyAuthAuditLogs } from '@/controllers/userAuditController';
import { exportMyData, importMyData } from '@/controllers/profileExtensionController';

const router = Router();

router.get('/me/audit', authMiddleware, listMyAuthAuditLogs as RequestHandler);
router.get('/me/export', authMiddleware, exportMyData as RequestHandler);
router.post('/me/import', authMiddleware, importMyData as RequestHandler);

router.get('/settings', authMiddleware, getSettings as RequestHandler);
router.patch('/settings', authMiddleware, patchSettings as RequestHandler);

router.get('/:identifier/public', getPublicProfile as RequestHandler);

router.post('/profile-picture', authMiddleware, profilePictureUpload.single('profilePicture'), uploadProfilePicture as RequestHandler);

router.delete('/profile-picture', authMiddleware, deleteProfilePicture as RequestHandler);

export default router;
