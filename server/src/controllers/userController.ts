import { Request, Response } from 'express';
import sharp from 'sharp';
import { db, schema } from '@/db/index';
import { eq } from 'drizzle-orm';
import fs from 'fs-extra';
import path from 'path';
import logger from '@/services/loggerService';

export const uploadProfilePicture = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    

    // Convert uploaded image to webp
    const originalPath = req.file.path;
    const userDir = path.dirname(originalPath);
    const webpFilename = path.basename(req.file.filename, path.extname(req.file.filename)) + '.webp';
    const webpPath = path.join(userDir, webpFilename);
    const tempPath = path.join(userDir, `.temp_${webpFilename}`);
    
    try {
      // Convert to webp using a temporary file to avoid input/output conflict
      await sharp(originalPath)
        .webp({ quality: 80 })
        .toFile(tempPath);
      // Remove the original uploaded file
      await fs.remove(originalPath);
      // Rename temp file to final webp path
      await fs.move(tempPath, webpPath, { overwrite: true });
    } catch (err) {
      // Clean up temp file if conversion failed
      await fs.remove(tempPath).catch(() => {});
      throw err;
    }
    const relativePath = `/media/pfp/${userId}/${webpFilename}`;

    // Delete old profile picture if it exists and is not the default
    const userData = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    if (userData.length > 0 && userData[0].image && !userData[0].image.startsWith('/default')) {
      // Translate /media/pfp/ to actual filepath
      const fileRelPath = userData[0].image.replace(/^\/media\/pfp\//, 'data/profile-pictures/');
      const oldImagePath = path.join(process.cwd(), '..', fileRelPath);
      try {
        await fs.remove(oldImagePath);
        logger.info(`Deleted old profile picture: ${oldImagePath}`);
      } catch (err) {
        logger.warn(`Failed to delete old profile picture: ${err}`);
      }
    }

    // Update user with new image path
    await db
      .update(schema.user)
      .set({ image: relativePath, updatedAt: new Date() })
      .where(eq(schema.user.id, userId));

    logger.info(`Profile picture uploaded for user ${userId}: ${relativePath}`);

    return res.status(200).json({
      message: 'Profile picture uploaded successfully',
      image: relativePath,
    });
  } catch (error: any) {
    logger.error(`Error uploading profile picture: ${error.message}`);
    return res.status(500).json({ error: error.message || 'Failed to upload profile picture' });
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
    const currentImage = userData[0].image;

    // Only delete if not the default image
    if (currentImage && !currentImage.startsWith('/default')) {
      // Translate /media/pfp/ to actual filepath
      const fileRelPath = currentImage.replace(/^\/media\/pfp\//, 'data/profile-pictures/');
      const imagePath = path.join(process.cwd(), '..', fileRelPath);
      try {
        await fs.remove(imagePath);
        logger.info(`Deleted profile picture: ${imagePath}`);
      } catch (err) {
        logger.warn(`Failed to delete profile picture: ${err}`);
      }
    }

    // Reset to default image
    const defaultImage = '/default-avatar.jpg';
    await db
      .update(schema.user)
      .set({ image: defaultImage, updatedAt: new Date() })
      .where(eq(schema.user.id, userId));

    logger.info(`Profile picture deleted for user ${userId}`);

    return res.status(200).json({
      message: 'Profile picture deleted successfully',
      image: defaultImage,
    });
  } catch (error: any) {
    logger.error(`Error deleting profile picture: ${error.message}`);
    return res.status(500).json({ error: error.message || 'Failed to delete profile picture' });
  }
};