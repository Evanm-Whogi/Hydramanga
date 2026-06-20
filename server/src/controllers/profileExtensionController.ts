import { Request, Response, NextFunction } from 'express';
import { dataExportService } from '@/services/dataExportService';
import {
  externalTrackerService,
  TrackerFetchError,
  type ExternalEntry,
  type ImportMode,
  type TrackerProvider,
} from '@/services/externalTrackerService';
import { CONTENT_LIMITS } from '@/lib/securityLimits';

function parseMode(value: unknown): ImportMode {
  return value === 'replace' ? 'replace' : 'merge';
}

export async function exportMyData(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const format = String(req.query.format ?? 'json').toLowerCase();
    const date = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const csv = await dataExportService.exportUserDataCsv(userId);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="mang-export-${date}.csv"`);
      return res.send(csv);
    }

    if (format === 'xml') {
      const username = req.user?.displayUsername || req.user?.username || req.user?.name || 'user';
      const xml = await dataExportService.exportUserDataXml(userId, username);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="mang-export-${date}.xml"`);
      return res.send(xml);
    }

    const data = await dataExportService.exportUserData(userId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="mang-export-${date}.json"`);
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

    await dataExportService.importUserData(userId, body, parseMode(body.mode));
    return res.json({ success: true });
  } catch (error: any) {
    if (error?.message?.includes('Too many') || error?.message?.includes('Too much')) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
}

export async function importExternalData(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const body = req.body ?? {};
    const provider = body.provider as TrackerProvider;
    if (provider !== 'anilist' && provider !== 'my_anime_list') {
      return res.status(400).json({ message: 'Invalid provider' });
    }
    if (!Array.isArray(body.entries)) {
      return res.status(400).json({ message: 'Missing entries' });
    }

    const entries: ExternalEntry[] = body.entries
      .filter((e: any) => e && (e.externalId != null) && typeof e.status === 'string')
      .map((e: any) => ({ externalId: String(e.externalId), status: e.status }));

    const summary = await externalTrackerService.importExternalEntries(userId, provider, entries, parseMode(body.mode));
    return res.json(summary);
  } catch (error: any) {
    if (error instanceof TrackerFetchError) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

export async function syncFromTracker(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const body = req.body ?? {};
    const provider = body.provider;
    if (provider !== 'anilist' && provider !== 'myanimelist') {
      return res.status(400).json({ message: 'Invalid provider' });
    }
    const username = typeof body.username === 'string' ? body.username : '';
    if (!username.trim()) {
      return res.status(400).json({ message: 'A username is required' });
    }

    const summary = await externalTrackerService.syncFromTracker(userId, provider, username, parseMode(body.mode));
    return res.json(summary);
  } catch (error: any) {
    if (error instanceof TrackerFetchError) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}
