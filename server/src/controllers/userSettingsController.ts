import { Request, Response } from 'express';
import { getUserSettings, updateUserSettings } from '@/services/userSettingsService';
import { recordAuditFromRequest } from '@/audit/record';

export async function getSettings(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const settings = await getUserSettings(userId);
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to get settings' });
  }
}

export async function patchSettings(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const { hideNsfw, isProfilePublic, incognitoMode, profileVisibility } = req.body || {};
    const settings = await updateUserSettings(userId, { hideNsfw, isProfilePublic, incognitoMode, profileVisibility });
    recordAuditFromRequest(req, {
      action: 'settings.update',
      category: 'settings',
      resourceType: 'user',
      resourceId: userId,
      metadata: { hideNsfw, isProfilePublic, incognitoMode, profileVisibility },
    });
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update settings' });
  }
}
