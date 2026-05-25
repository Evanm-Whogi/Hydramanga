import { Request, Response, NextFunction } from 'express';
import { adminUserService } from '@/services/adminUserService';
import logger from '@/services/loggerService';

export async function listAdminUsers(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const rawPage = Number(req.query.page ?? 1);
    const rawLimit = Number(req.query.limit ?? 20);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 20;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const status = req.query.status === 'active' || req.query.status === 'banned' ? req.query.status : 'all';
    const sort =
      req.query.sort === 'name' || req.query.sort === 'email' || req.query.sort === 'createdAt'
        ? req.query.sort
        : 'createdAt';
    const order = req.query.order === 'asc' ? 'asc' : 'desc';

    const result = await adminUserService.listUsers({
      page,
      limit,
      search,
      role: role === 'all' ? undefined : role,
      status,
      sort,
      order,
    });

    return res.json({ status: 200, ...result });
  } catch (error) {
    logger.error(`Failed to list admin users: ${error}`, { service: 'adminUserController' });
    return next(error);
  }
}

export async function getAdminUser(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ message: 'User ID is required' });

    const user = await adminUserService.getUserById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json({ status: 200, user });
  } catch (error) {
    logger.error(`Failed to get admin user: ${error}`, { service: 'adminUserController' });
    return next(error);
  }
}

export async function patchAdminUser(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ message: 'User ID is required' });

    const { name, email, role, bio, emailVerified, image } = req.body ?? {};
    const updates: {
      name?: string;
      email?: string;
      role?: string;
      bio?: string | null;
      emailVerified?: boolean;
      image?: string | null;
    } = {};

    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (bio !== undefined) updates.bio = bio;
    if (emailVerified !== undefined) updates.emailVerified = emailVerified;
    if (image !== undefined) updates.image = image;

    const result = await adminUserService.updateUser(userId, updates);

    if ('error' in result) {
      switch (result.error) {
        case 'not_found':
          return res.status(404).json({ message: 'User not found' });
        case 'invalid_name':
          return res.status(400).json({ message: 'Name must be between 1 and 100 characters' });
        case 'invalid_email':
          return res.status(400).json({ message: 'Please provide a valid email address' });
        case 'duplicate_email':
          return res.status(400).json({ message: 'Email is already in use' });
        case 'invalid_role':
          return res.status(400).json({ message: 'Role must be "user" or "admin"' });
        case 'last_admin':
          return res.status(400).json({ message: 'Cannot remove the last admin account' });
        case 'invalid_bio':
          return res.status(400).json({ message: 'Bio must be 500 characters or less' });
        case 'invalid_image':
          return res.status(400).json({ message: 'Image path is too long' });
        case 'no_changes':
          return res.status(400).json({ message: 'No valid fields to update' });
        default:
            logger.error(`Unhandled update user error: ${result.error}`, { service: 'adminUserController' });
            return next(new Error(`Unhandled update user error: ${result.error}`));
      }
    }

    return res.json({ status: 200, user: result.user });
  } catch (error) {
    logger.error(`Failed to update admin user: ${error}`, { service: 'adminUserController' });
    return next(error);
  }
}