import { Router, RequestHandler } from 'express';
import { authMiddleware } from '@/middlewares/auth';
import { profilePictureUpload } from '@/config/multer';
import { uploadProfilePicture, deleteProfilePicture } from '@/controllers/userController';
import { getSettings, patchSettings } from '@/controllers/userSettingsController';
import { getPublicProfile } from '@/controllers/profileController';
import { listMyAuthAuditLogs } from '@/controllers/userAuditController';
import { exportMyData, importMyData } from '@/controllers/profileExtensionController';
import { getProfileStats, getProfileFavorites, setMyFavorites, getProfileWall, createProfileWallPost, updateProfileWallPost, voteProfileWallPost, deleteProfileWallPost, getProfileComments, getProfileRecentReads, getProfileBookmarks, getProfileLists } from '@/controllers/profileSectionController';
import { followUser, unfollowUser } from '@/controllers/userFollowController';
import { claimEasterEggBadge } from '@/controllers/userBadgeController';
import { reportUser } from '@/controllers/userReportController';
import { publicFormRateLimiter } from '@/middlewares/rateLimit';
import { dataExportRateLimit, dataImportRateLimit, profilePictureRateLimit, settingsPatchRateLimit, commentMutationRateLimit, listVoteRateLimit, listWriteRateLimit } from '@/middlewares/userActionRateLimit';

const router = Router();

router.post('/me/badges/easter-egg', authMiddleware, claimEasterEggBadge as RequestHandler);
router.get('/me/audit', authMiddleware, listMyAuthAuditLogs as RequestHandler);
router.get('/me/export', authMiddleware, dataExportRateLimit, exportMyData as RequestHandler);
router.post('/me/import', authMiddleware, dataImportRateLimit, importMyData as RequestHandler);
router.put('/me/favorites', authMiddleware, setMyFavorites as RequestHandler);

router.get('/settings', authMiddleware, getSettings as RequestHandler);
router.patch('/settings', authMiddleware, settingsPatchRateLimit, patchSettings as RequestHandler);

router.get('/:identifier/stats', getProfileStats as RequestHandler);
router.get('/:identifier/favorites', getProfileFavorites as RequestHandler);
router.get('/:identifier/wall', getProfileWall as RequestHandler);
router.post('/:identifier/wall', authMiddleware, commentMutationRateLimit, createProfileWallPost as RequestHandler);
router.post('/:identifier/wall/vote', authMiddleware, listVoteRateLimit, voteProfileWallPost as RequestHandler);
router.put('/:identifier/wall/:postId', authMiddleware, commentMutationRateLimit, updateProfileWallPost as RequestHandler);
router.delete('/:identifier/wall/:postId', authMiddleware, deleteProfileWallPost as RequestHandler);
router.get('/:identifier/comments', getProfileComments as RequestHandler);
router.get('/:identifier/recent-reads', getProfileRecentReads as RequestHandler);
router.get('/:identifier/bookmarks', getProfileBookmarks as RequestHandler);
router.get('/:identifier/lists', getProfileLists as RequestHandler);

router.post('/:identifier/follow', authMiddleware, listWriteRateLimit, followUser as RequestHandler);
router.delete('/:identifier/follow', authMiddleware, listWriteRateLimit, unfollowUser as RequestHandler);
router.post('/:identifier/report', authMiddleware, publicFormRateLimiter, reportUser as RequestHandler);

router.get('/:identifier/public', getPublicProfile as RequestHandler);

router.post('/profile-picture', authMiddleware, profilePictureRateLimit, profilePictureUpload.single('profilePicture'), uploadProfilePicture as RequestHandler);

router.delete('/profile-picture', authMiddleware, profilePictureRateLimit, deleteProfilePicture as RequestHandler);

export default router;
