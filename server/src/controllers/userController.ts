import { Request, Response } from 'express';
import sharp from 'sharp';
import { db, schema } from '@/db/index';
import { eq } from 'drizzle-orm';
import logger from '@/services/loggerService';
import { recordAuditFromRequest } from '@/audit/record';
import { bufferMatchesAllowedImageSignature } from '@/lib/imageMagicBytes';
import { profilePictureStorageService } from '@/services/profilePictureStorageService';
import { badgeService } from '@/services/badgeService';

export const uploadProfilePicture = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!req.file?.buffer) return res.status(400).json({ error: 'No file uploaded' });

    if (!bufferMatchesAllowedImageSignature(req.file.buffer.subarray(0, 12))) {
      return res.status(400).json({ error: 'Invalid image file' });
    }

    // Transcode to webp in memory and upload to object storage.
    const webpBuffer = await sharp(req.file.buffer).webp({ quality: 80 }).toBuffer();
    const imageUrl = await profilePictureStorageService.uploadAvatar(userId, webpBuffer);

    // Delete the previous avatar (no-op for the default or external URLs).
    const userData = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    if (userData.length > 0 && userData[0].image) {
      try {
        await profilePictureStorageService.deleteByUrl(userData[0].image);
      } catch (err) {
        logger.warn(`Failed to delete old profile picture: ${err}`);
      }
    }

    // Update user with new image URL
    await db
      .update(schema.user)
      .set({ image: imageUrl, updatedAt: new Date() })
      .where(eq(schema.user.id, userId));

    logger.info(`Profile picture uploaded for user ${userId}: ${imageUrl}`);

    recordAuditFromRequest(req, {
      action: 'profile.avatar.upload',
      category: 'settings',
      resourceType: 'user',
      resourceId: userId,
    });

    badgeService.evaluateBadgesAsync(userId, 'profile_update');

    return res.status(200).json({
      message: 'Profile picture uploaded successfully',
      image: imageUrl,
    });
  } catch (error: any) {
    logger.error(`Error uploading profile picture: ${error.message}`);
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Failed to upload profile picture'
        : error.message || 'Failed to upload profile picture';
    return res.status(500).json({ error: message });
  }
};

export const deleteProfilePicture = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Get user data
    const userData = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    if (userData.length === 0) return res.status(404).json({ error: 'User not found' });

    // Delete current avatar (no-op for the default or external URLs).
    try {
      await profilePictureStorageService.deleteByUrl(userData[0].image);
    } catch (err) {
      logger.warn(`Failed to delete profile picture: ${err}`);
    }

    // Reset to default image
    const defaultImage = profilePictureStorageService.defaultAvatarUrl;
    await db
      .update(schema.user)
      .set({ image: defaultImage, updatedAt: new Date() })
      .where(eq(schema.user.id, userId));

    logger.info(`Profile picture deleted for user ${userId}`);

    recordAuditFromRequest(req, {
      action: 'profile.avatar.delete',
      category: 'settings',
      resourceType: 'user',
      resourceId: userId,
    });

    return res.status(200).json({
      message: 'Profile picture deleted successfully',
      image: defaultImage,
    });
  } catch (error: any) {
    logger.error(`Error deleting profile picture: ${error.message}`);
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Failed to delete profile picture'
        : error.message || 'Failed to delete profile picture';
    return res.status(500).json({ error: message });
  }
};
