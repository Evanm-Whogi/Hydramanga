import { Request, Response, NextFunction } from 'express';
import { stickerService } from '@/services/stickerService';

export async function listStickers(req: Request, res: Response, next: NextFunction) {
  try {
    const stickers = await stickerService.listPublic();
    return res.json({ stickers });
  } catch (error) {
    return next(error);
  }
}
