import { Request, Response, NextFunction } from 'express';
import { notificationService } from '@/services/notificationService';

export async function listNotifications(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const notifications = await notificationService.listForUser(req.user.id);
    return res.status(200).json({ notifications, count: notifications.length });
  } catch (error) {
    return next(error);
  }
}

export async function dismissNotification(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  const notificationId = parseInt(req.params.id, 10);
  if (!Number.isFinite(notificationId) || notificationId <= 0) {
    return res.status(400).json({ message: 'Invalid notification id' });
  }

  try {
    const removed = await notificationService.dismiss(req.user.id, notificationId);
    if (!removed) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    const notifications = await notificationService.listForUser(req.user.id);
    return res.status(200).json({ notifications, count: notifications.length });
  } catch (error) {
    return next(error);
  }
}

export async function clearAllNotifications(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    await notificationService.clearAll(req.user.id);
    return res.status(200).json({ notifications: [], count: 0 });
  } catch (error) {
    return next(error);
  }
}
