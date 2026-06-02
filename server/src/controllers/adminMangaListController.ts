import { Request, Response, NextFunction } from 'express';
import { adminMangaListService } from '@/services/adminMangaListService';
import logger from '@/services/loggerService';

export async function listAdminManga(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const rawPage = Number(req.query.page ?? 1);
    const rawLimit = Number(req.query.limit ?? 20);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 20;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const scraperId = typeof req.query.scraperId === 'string' ? req.query.scraperId : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const sort =
      req.query.sort === 'title' || req.query.sort === 'chapters' || req.query.sort === 'updated' || req.query.sort === 'type'
        ? req.query.sort
        : 'updated';
    const order = req.query.order === 'asc' ? 'asc' : 'desc';

    const result = await adminMangaListService.listManga({
      page,
      limit,
      search,
      status: status === 'all' ? undefined : status,
      scraperId: scraperId === 'all' ? undefined : scraperId,
      type: type === 'all' ? undefined : type,
      sort,
      order,
    });

    return res.json({ status: 200, ...result });
  } catch (error) {
    logger.error(`Failed to list admin manga: ${error}`, { service: 'adminMangaListController' });
    return next(error);
  }
}

export async function listAdminMangaScraperFilters(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const filters = await adminMangaListService.getScraperFilterOptions();
    return res.json({ status: 200, filters });
  } catch (error) {
    logger.error(`Failed to list scraper filters: ${error}`, { service: 'adminMangaListController' });
    return next(error);
  }
}

export async function listAdminMangaTypeFilters(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const filters = await adminMangaListService.getTypeFilterOptions();
    return res.json({ status: 200, filters });
  } catch (error) {
    logger.error(`Failed to list type filters: ${error}`, { service: 'adminMangaListController' });
    return next(error);
  }
}
