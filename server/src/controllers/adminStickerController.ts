import { Request, Response, NextFunction } from 'express';
import { stickerService } from '@/services/stickerService';
import { recordAuditFromRequest } from '@/audit/record';

export async function listAdminStickers(req: Request, res: Response, next: NextFunction) {
  try {
    const stickers = await stickerService.listAdmin();
    return res.json({ stickers });
  } catch (error) {
    return next(error);
  }
}

export async function scanAdminStickers(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await stickerService.scanAndImportFromDisk();
    recordAuditFromRequest(req, {
      action: 'sticker.scan',
      category: 'admin',
      resourceType: 'content_sticker',
      metadata: { added: result.added, skipped: result.skipped, addedFiles: result.addedFiles },
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function createAdminSticker(req: Request, res: Response, next: NextFunction) {
  try {
    const { label, imageUrl, sortOrder, isActive } = req.body;
    if (!imageUrl?.trim()) return res.status(400).json({ message: 'Image URL is required' });
    const sticker = await stickerService.create({ label, imageUrl, sortOrder, isActive });
    recordAuditFromRequest(req, {
      action: 'sticker.create',
      category: 'admin',
      resourceType: 'content_sticker',
      resourceId: String(sticker.id),
      metadata: { label: sticker.label, imageUrl: sticker.imageUrl },
    });
    return res.status(201).json({ sticker });
  } catch (error: any) {
    if (error.message?.includes('Image URL')) return res.status(400).json({ message: error.message });
    return next(error);
  }
}

export async function updateAdminSticker(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.stickerId, 10);
    const { label, imageUrl, sortOrder, isActive } = req.body;
    const sticker = await stickerService.update(id, { label, imageUrl, sortOrder, isActive });
    recordAuditFromRequest(req, {
      action: 'sticker.update',
      category: 'admin',
      resourceType: 'content_sticker',
      resourceId: String(sticker.id),
      metadata: { label: sticker.label, imageUrl: sticker.imageUrl, isActive: sticker.isActive },
    });
    return res.json({ sticker });
  } catch (error: any) {
    if (error.message === 'Sticker not found') return res.status(404).json({ message: error.message });
    if (error.message?.includes('Image URL')) return res.status(400).json({ message: error.message });
    return next(error);
  }
}

export async function deleteAdminSticker(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.stickerId, 10);
    await stickerService.remove(id);
    recordAuditFromRequest(req, {
      action: 'sticker.delete',
      category: 'admin',
      resourceType: 'content_sticker',
      resourceId: String(id),
    });
    return res.json({ message: 'Deleted' });
  } catch (error: any) {
    if (error.message === 'Sticker not found') return res.status(404).json({ message: error.message });
    return next(error);
  }
}
