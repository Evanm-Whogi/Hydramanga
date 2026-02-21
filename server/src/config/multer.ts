import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';

// Create profile-pictures directory if it doesn't exist
const PROFILE_PICTURES_DIR = path.join(process.cwd(), '../data/profile-pictures');
fs.ensureDirSync(PROFILE_PICTURES_DIR);

// Allowed image MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

// File size limit (5MB)
const FILE_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB

// Storage configuration for profile pictures
const profilePictureStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Get user ID from request (populated by auth middleware)
    const userId = (req as any).user?.id;
    if (!userId) return cb(new Error('User ID not found in request'), '');
    
    const userDir = path.join(PROFILE_PICTURES_DIR, userId);
    fs.ensureDirSync(userDir);
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    // Generate filename: timestamp-random.extension
    const ext = path.extname(file.originalname).toLowerCase();
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    cb(null, `profile-${timestamp}-${random}${ext}`);
  },
});

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

export { PROFILE_PICTURES_DIR, FILE_SIZE_LIMIT, ALLOWED_MIME_TYPES };
