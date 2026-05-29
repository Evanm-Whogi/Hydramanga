import { Request, Response, NextFunction } from 'express';
import { dataExportService } from '@/services/dataExportService';
import { CONTENT_LIMITS } from '@/lib/securityLimits';

export async function exportMyData(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const data = await dataExportService.exportUserData(userId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="mang-export.json"');
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

export async function importMyData(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const body = req.body ?? {};
    const payloadBytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
    if (payloadBytes > CONTENT_LIMITS.importPayloadMaxBytes) {
      return res.status(400).json({ message: 'Import payload is too large' });
    }

    await dataExportService.importUserData(userId, body);
    return res.json({ success: true });
  } catch (error: any) {
    if (error?.message?.includes('Too many') || error?.message?.includes('Too much')) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
}
