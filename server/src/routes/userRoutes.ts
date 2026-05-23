import { Router, RequestHandler } from 'express';
import { authMiddleware } from '@/middlewares/auth';
import { profilePictureUpload } from '@/config/multer';
import { uploadProfilePicture, deleteProfilePicture } from '@/controllers/userController';
import { getSettings, patchSettings } from '@/controllers/userSettingsController';
import { getPublicProfile } from '@/controllers/profileController';

const router = Router();

// User settings (e.g. hide NSFW)
router.get('/settings', getSettings as RequestHandler);
router.patch('/settings', patchSettings as RequestHandler);

router.get('/:userId/public', getPublicProfile as RequestHandler);

// Upload profile picture
router.post('/profile-picture', authMiddleware, profilePictureUpload.single('profilePicture'), uploadProfilePicture as RequestHandler);

// Delete profile picture
router.delete('/profile-picture', authMiddleware, deleteProfilePicture as RequestHandler);

export default router;
