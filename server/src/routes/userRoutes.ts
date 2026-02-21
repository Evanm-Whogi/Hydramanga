import { Router, RequestHandler } from 'express';
import { authMiddleware } from '@/middlewares/auth';
import { profilePictureUpload } from '@/config/multer';
import { uploadProfilePicture, deleteProfilePicture } from '@/controllers/userController';

const router = Router();

// Upload profile picture
router.post('/profile-picture', authMiddleware, profilePictureUpload.single('profilePicture'), uploadProfilePicture as RequestHandler);

// Delete profile picture
router.delete('/profile-picture', authMiddleware, deleteProfilePicture as RequestHandler);

export default router;
