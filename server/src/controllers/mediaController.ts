/**
 * Stable same-origin media redirects for avatars and stickers.
 *
 * Avatars and stickers are stored/embedded under `/api/media/...` (a host-agnostic
 * stable value, so stored DB rows and baked-in content survive a storage/CDN
 * change). This controller 302-redirects each request to the stable public URL on
 * the custom image domain (Cloudflare-fronted); the browser never sees the raw
 * storage host and the image bytes are cached at the CDN edge — they never pass
 * through the app. The redirect target is permanent, so the 302 itself is cached
 * for a long time to keep repeat views off Node.
 */
import { Request, Response } from 'express';
import { profilePictureStorageService } from '@/services/profilePictureStorageService';
import { stickerStorageService } from '@/services/stickerStorageService';

// The redirect target is stable, so cache the 302 aggressively.
const REDIRECT_CACHE_SECONDS = 86400;

export function redirectAvatar(req: Request, res: Response): Response | void {
    const { userId, file } = req.params;
    const url = profilePictureStorageService.resolveCdnUrl(userId, file);
    if (!url) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Cache-Control', `public, max-age=${REDIRECT_CACHE_SECONDS}`);
    return res.redirect(302, url);
}

export function redirectSticker(req: Request, res: Response): Response | void {
    const { file } = req.params;
    const url = stickerStorageService.resolveCdnUrl(file);
    if (!url) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Cache-Control', `public, max-age=${REDIRECT_CACHE_SECONDS}`);
    return res.redirect(302, url);
}
