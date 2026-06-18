import multer from 'multer';
import path from 'path';

// Allowed image MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

// File size limit (5MB)
const FILE_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB

// Profile pictures are uploaded to object storage (Garage), so keep the file in
// memory and let the controller transcode + upload the buffer.
const profilePictureStorage = multer.memoryStorage();

// File filter for profile pictures
const profilePictureFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) return cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`));

  // Validate by extension as well
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  if (!allowedExtensions.includes(ext)) return cb(new Error(`Invalid file extension. Allowed: ${allowedExtensions.join(', ')}`));

  cb(null, true);
};

// Create multer instance for profile pictures
export const profilePictureUpload = multer({
  storage: profilePictureStorage,
  fileFilter: profilePictureFileFilter,
  limits: {
    fileSize: FILE_SIZE_LIMIT,
  },
});

export { FILE_SIZE_LIMIT, ALLOWED_MIME_TYPES };
