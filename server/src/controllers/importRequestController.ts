import { Request, Response, NextFunction } from 'express';
import { importRequestService } from '@/services/importRequestService';
import logger from '@/services/loggerService';
import { discordService } from '@/services/discordService';
import { recordAuditFromRequest } from '@/audit/record';
import { adminImportsHref, contentAuditMeta } from '@/audit/metadataHelpers';

export async function createImportRequest(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user?.id;
    const userName = req.user?.name;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { requestedTitle, requestedUrl, notes, seriesId } = req.body ?? {};
    const result = await importRequestService.createRequest(userId, {
      requestedTitle,
      requestedUrl,
      notes,
      seriesId,
    });

    if ('error' in result) {
      switch (result.error) {
        case 'invalid_title':
          return res.status(400).json({ message: 'Title is required (max 500 characters)' });
        case 'invalid_url':
          return res.status(400).json({ message: 'URL is too long' });
        case 'invalid_notes':
          return res.status(400).json({ message: 'Notes are too long' });
        case 'invalid_series':
        case 'series_not_found':
          return res.status(400).json({ message: 'Invalid manga reference' });
      }
    }

    await discordService.notifyImportRequest(
      userName ?? 'Unknown',
      result.request.requestedTitle,
      result.request.requestedUrl,
      result.request.notes,
      result.request.id,
      result.request.seriesId
    );

    recordAuditFromRequest(req, {
      action: 'import_request.create',
      category: 'manga',
      resourceType: 'import_request',
      resourceId: String(result.request.id),
      metadata: contentAuditMeta({
        href: '/request',
        summary: `Requested import: ${result.request.requestedTitle}`,
        title: result.request.requestedTitle,
        content: result.request.notes ?? result.request.requestedUrl ?? undefined,
        extra: { requestedUrl: result.request.requestedUrl, seriesId: result.request.seriesId },
      }),
    });

    return res.status(201).json({ status: 201, request: result.request });
  } catch (error) {
    logger.error(`Failed to create import request: ${error}`, { service: 'importRequestController' });
    return next(error);
  }
}

export async function listMyImportRequests(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const requests = await importRequestService.listForUser(userId);
    return res.json({ status: 200, requests });
  } catch (error) {
    logger.error(`Failed to list import requests: ${error}`, { service: 'importRequestController' });
    return next(error);
  }
}

export async function listAdminImportRequests(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const rawPage = Number(req.query.page ?? 1);
    const rawLimit = Number(req.query.limit ?? 20);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 20;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const result = await importRequestService.listAdmin({ page, limit, search, status });
    return res.json({ status: 200, ...result });
  } catch (error) {
    logger.error(`Failed to list admin import requests: ${error}`, { service: 'importRequestController' });
    return next(error);
  }
}

export async function patchAdminImportRequest(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    const { status, adminNotes, seriesId } = req.body ?? {};
    const updates: { status?: string; adminNotes?: string | null; seriesId?: number | null } = {};
    if (status !== undefined) updates.status = status;
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;
    if (seriesId !== undefined) updates.seriesId = seriesId;

    const result = await importRequestService.updateAdmin(id, updates);

    if ('error' in result) {
      switch (result.error) {
        case 'not_found':
          return res.status(404).json({ message: 'Import request not found' });
        case 'invalid_status':
          return res.status(400).json({ message: 'Invalid status' });
        case 'invalid_admin_notes':
          return res.status(400).json({ message: 'Admin notes are too long' });
        case 'invalid_series':
        case 'series_not_found':
          return res.status(400).json({ message: 'Invalid manga reference' });
        case 'no_changes':
          return res.status(400).json({ message: 'No valid fields to update' });
      }
    }

    const reqRow = result.request;
    const summaryParts = [`Updated import request #${id}`];
    if (updates.status) summaryParts.push(`status → ${reqRow.status}`);
    if (updates.adminNotes !== undefined) {
      summaryParts.push(
        updates.adminNotes
          ? `notes: "${String(updates.adminNotes).slice(0, 120)}${String(updates.adminNotes).length > 120 ? '…' : ''}"`
          : 'cleared admin notes'
      );
    }
    if (updates.seriesId !== undefined) {
      summaryParts.push(`series link → ${reqRow.seriesId ?? 'none'}`);
    }

    res.locals.auditLoggedExplicitly = true;
    recordAuditFromRequest(req, {
      action: 'admin.import_request.update',
      category: 'admin',
      resourceType: 'import_request',
      resourceId: String(id),
      metadata: contentAuditMeta({
        href: adminImportsHref(),
        summary: summaryParts.join(' · '),
        title: reqRow.requestedTitle,
        content: reqRow.requestedUrl ?? reqRow.notes ?? undefined,
        extra: {
          status: reqRow.status,
          adminNotes: reqRow.adminNotes,
          requestedTitle: reqRow.requestedTitle,
          requestedUrl: reqRow.requestedUrl,
          userNotes: reqRow.notes,
          seriesId: reqRow.seriesId,
          changes: updates,
        },
      }),
    });

    return res.json({ status: 200, request: result.request });
  } catch (error) {
    logger.error(`Failed to update admin import request: ${error}`, { service: 'importRequestController' });
    return next(error);
  }
}
