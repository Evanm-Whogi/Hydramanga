import { Request, Response, NextFunction } from 'express';
import { authorService, AuthorSort } from '@/services/authorService';
import { resolveHideNsfw } from '@/services/userSettingsService';

const VALID_SORTS: AuthorSort[] = ['works', 'name', 'newest'];

function parseSort(value: unknown): AuthorSort {
  const sort = typeof value === 'string' ? value : 'works';
  return VALID_SORTS.includes(sort as AuthorSort) ? (sort as AuthorSort) : 'works';
}

export async function getAuthors(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 24, 1), 48);
    const sort = parseSort(req.query.sort);
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const letter = typeof req.query.letter === 'string' ? req.query.letter : undefined;
    const hideNsfw = await resolveHideNsfw(req);

    const result = await authorService.listAuthors({ search, letter, sort, page, limit, hideNsfw });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getTopAuthors(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 10, 1), 30);
    const hideNsfw = await resolveHideNsfw(req);
    const authors = await authorService.getTopAuthors(limit, hideNsfw);
    return res.json({ authors });
  } catch (error) {
    return next(error);
  }
}

export async function getAuthorDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const name = decodeURIComponent(req.params.name ?? '');
    const hideNsfw = await resolveHideNsfw(req);
    const detail = await authorService.getAuthorDetail(name, hideNsfw);
    if (!detail) return res.status(404).json({ error: 'Author not found' });
    return res.json(detail);
  } catch (error) {
    return next(error);
  }
}
