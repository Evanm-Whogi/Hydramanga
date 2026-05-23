import { db, schema } from '@/db/index';
import { eq, or, ilike, desc, asc, count, and, ne, SQL } from 'drizzle-orm';
import { userProgressService } from '@/services/userProgressService';

const VALID_ROLES = ['user', 'admin'] as const;
type UserRole = (typeof VALID_ROLES)[number];

export interface AdminUserListParams {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  sort?: 'createdAt' | 'name' | 'email';
  order?: 'asc' | 'desc';
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  image: string | null;
  bio: string | null;
  emailVerified: boolean;
  createdAt: Date;
  xp: {
    totalXp: number;
    level: number;
    levelName: string;
  };
}

class AdminUserService {
  async listUsers(params: AdminUserListParams) {
    const { page, limit, search, role, sort = 'createdAt', order = 'desc' } = params;
    const offset = (page - 1) * limit;

    const filters: SQL[] = [];
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      filters.push(or(ilike(schema.user.name, term), ilike(schema.user.email, term))!);
    }
    if (role && VALID_ROLES.includes(role as UserRole)) {
      filters.push(eq(schema.user.role, role));
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const sortColumn =
      sort === 'name'
        ? schema.user.name
        : sort === 'email'
          ? schema.user.email
          : schema.user.createdAt;
    const orderBy = order === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const [rows, totalResult] = await Promise.all([
      db
        .select({
          id: schema.user.id,
          name: schema.user.name,
          email: schema.user.email,
          role: schema.user.role,
          image: schema.user.image,
          bio: schema.user.bio,
          emailVerified: schema.user.emailVerified,
          createdAt: schema.user.createdAt,
        })
        .from(schema.user)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(schema.user).where(whereClause),
    ]);

    const total = Number(totalResult[0]?.total ?? 0);
    const xpMap = await userProgressService.getUserXpSummaries(rows.map((r) => r.id));

    const users: AdminUserRow[] = rows.map((row) => ({
      ...row,
      xp: xpMap[row.id] ?? { totalXp: 0, level: 1, levelName: 'Rookie Reader' },
    }));

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getUserById(userId: string) {
    const [row] = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        role: schema.user.role,
        image: schema.user.image,
        bio: schema.user.bio,
        emailVerified: schema.user.emailVerified,
        createdAt: schema.user.createdAt,
        updatedAt: schema.user.updatedAt,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    if (!row) return null;

    const stats = await userProgressService.getUserStats(userId);

    return {
      ...row,
      stats,
    };
  }

  async countAdmins(): Promise<number> {
    const [result] = await db
      .select({ total: count() })
      .from(schema.user)
      .where(eq(schema.user.role, 'admin'));
    return Number(result?.total ?? 0);
  }

  async updateUser(userId: string, updates: {name?: string; email?: string; role?: string; bio?: string | null; emailVerified?: boolean; image?: string | null;}) {
    const [existing] = await db
      .select({
        id: schema.user.id,
        role: schema.user.role,
        email: schema.user.email,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    if (!existing) {
      return { error: 'not_found' as const };
    }

    const hasChange =
      updates.name !== undefined ||
      updates.email !== undefined ||
      updates.role !== undefined ||
      updates.bio !== undefined ||
      updates.emailVerified !== undefined ||
      updates.image !== undefined;

    if (!hasChange) {
      return { error: 'no_changes' as const };
    }

    const patch: {
      name?: string;
      email?: string;
      role?: string;
      bio?: string | null;
      emailVerified?: boolean;
      image?: string | null;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (updates.name !== undefined) {
      const name = updates.name.trim();
      if (!name || name.length > 100) {
        return { error: 'invalid_name' as const };
      }
      patch.name = name;
    }

    if (updates.email !== undefined) {
      const email = updates.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: 'invalid_email' as const };
      }
      if (email !== existing.email.toLowerCase()) {
        const [duplicate] = await db
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(and(eq(schema.user.email, email), ne(schema.user.id, userId)))
          .limit(1);
        if (duplicate) {
          return { error: 'duplicate_email' as const };
        }
      }
      patch.email = email;
    }

    if (updates.role !== undefined) {
      if (!VALID_ROLES.includes(updates.role as UserRole)) {
        return { error: 'invalid_role' as const };
      }

      const nextRole = updates.role as UserRole;
      const demotingAdmin = existing.role === 'admin' && nextRole !== 'admin';

      if (demotingAdmin) {
        const adminCount = await this.countAdmins();
        if (adminCount <= 1) {
          return { error: 'last_admin' as const };
        }
      }

      patch.role = nextRole;
    }

    if (updates.bio !== undefined) {
      const bio = updates.bio?.trim() || null;
      if (bio && bio.length > 500) {
        return { error: 'invalid_bio' as const };
      }
      patch.bio = bio;
    }

    if (updates.emailVerified !== undefined) {
      patch.emailVerified = Boolean(updates.emailVerified);
    }

    if (updates.image !== undefined) {
      const image = updates.image?.trim() || null;
      if (image && image.length > 500) {
        return { error: 'invalid_image' as const };
      }
      patch.image = image ?? '/default-avatar.jpg';
    }

    const [updated] = await db
      .update(schema.user)
      .set(patch)
      .where(eq(schema.user.id, userId))
      .returning({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        role: schema.user.role,
        image: schema.user.image,
        bio: schema.user.bio,
        emailVerified: schema.user.emailVerified,
        createdAt: schema.user.createdAt,
      });

    const xpMap = await userProgressService.getUserXpSummaries([userId]);

    return {
      user: {
        ...updated,
        xp: xpMap[userId] ?? { totalXp: 0, level: 1, levelName: 'Rookie Reader' },
      },
    };
  }
}

export const adminUserService = new AdminUserService();
