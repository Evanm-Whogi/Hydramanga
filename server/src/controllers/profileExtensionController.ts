import { Request, Response, NextFunction } from 'express';
import { dataExportService } from '@/services/dataExportService';

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

    await dataExportService.importUserData(userId, req.body ?? {});
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
}
