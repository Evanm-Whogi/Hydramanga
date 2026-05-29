import { db, schema } from '@/db/index';
import { eq, or, ilike, desc, asc, count, and, ne, SQL, gt, lt, isNull, isNotNull, inArray, max } from 'drizzle-orm';
import { userProgressService } from '@/services/userProgressService';
import { isUserBanned } from '@/lib/banHelpers';
import { isAllowedProfileImageUrl } from '@/lib/profileImagePath';

const VALID_ROLES = ['user', 'admin'] as const;
type UserRole = (typeof VALID_ROLES)[number];

export interface AdminUserListParams {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  status?: 'all' | 'active' | 'banned';
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
  banned: boolean;
  banReason: string | null;
  banExpires: Date | null;
  isBanned: boolean;
  createdAt: Date;
  lastOnlineAt: Date | null;
  xp: {
    totalXp: number;
    level: number;
    levelName: string;
  };
}

const userSelectFields = {
  id: schema.user.id,
  name: schema.user.name,
  email: schema.user.email,
  role: schema.user.role,
  image: schema.user.image,
  bio: schema.user.bio,
  emailVerified: schema.user.emailVerified,
  banned: schema.user.banned,
  banReason: schema.user.banReason,
  banExpires: schema.user.banExpires,
  createdAt: schema.user.createdAt,
};

async function getLastOnlineMap(userIds: string[]) {
  if (userIds.length === 0) return {} as Record<string, Date | null>;

  const rows = await db
    .select({
      userId: schema.session.userId,
      lastOnlineAt: max(schema.session.updatedAt),
    })
    .from(schema.session)
    .where(inArray(schema.session.userId, userIds))
    .groupBy(schema.session.userId);

  return rows.reduce<Record<string, Date | null>>((acc, row) => {
    acc[row.userId] = row.lastOnlineAt ?? null;
    return acc;
  }, {});
}

function toAdminUserRow(
  row: {
    id: string;
    name: string;
    email: string;
    role: string;
    image: string | null;
    bio: string | null;
    emailVerified: boolean;
    banned: boolean | null;
    banReason: string | null;
    banExpires: Date | null;
    createdAt: Date;
  },
  xp: AdminUserRow['xp']
): AdminUserRow {
  const banned = Boolean(row.banned);
  return {
    ...row,
    banned,
    banReason: row.banReason,
    banExpires: row.banExpires,
    isBanned: isUserBanned({ banned, banExpires: row.banExpires }),
    lastOnlineAt: null,
    xp,
  };
}

class AdminUserService {
  async listUsers(params: AdminUserListParams) {
    const { page, limit, search, role, status = 'all', sort = 'createdAt', order = 'desc' } = params;
    const offset = (page - 1) * limit;

    const filters: SQL[] = [];
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      filters.push(or(ilike(schema.user.name, term), ilike(schema.user.email, term))!);
    }
    if (role && VALID_ROLES.includes(role as UserRole)) {
      filters.push(eq(schema.user.role, role));
    }
    if (status === 'banned') {
      filters.push(eq(schema.user.banned, true));
      filters.push(or(isNull(schema.user.banExpires), gt(schema.user.banExpires, new Date()))!);
    } else if (status === 'active') {
      filters.push(
        or(
          eq(schema.user.banned, false),
          and(
            eq(schema.user.banned, true),
            isNotNull(schema.user.banExpires),
            lt(schema.user.banExpires, new Date())
          )
        )!
      );
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
        .select(userSelectFields)
        .from(schema.user)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(schema.user).where(whereClause),
    ]);

    const total = Number(totalResult[0]?.total ?? 0);
    const xpMap = await userProgressService.getUserXpSummaries(rows.map((r) => r.id));
    const lastOnlineMap = await getLastOnlineMap(rows.map((r) => r.id));

    const users: AdminUserRow[] = rows.map((row) =>
      ({
        ...toAdminUserRow(row, xpMap[row.id] ?? { totalXp: 0, level: 1, levelName: 'Rookie Reader' }),
        lastOnlineAt: lastOnlineMap[row.id] ?? row.createdAt,
      })
    );

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
        ...userSelectFields,
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

  async getUserForAdmin(userId: string): Promise<AdminUserRow | null> {
    const [row] = await db.select(userSelectFields).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
    if (!row) return null;
    const xpMap = await userProgressService.getUserXpSummaries([userId]);
    return toAdminUserRow(row, xpMap[userId] ?? { totalXp: 0, level: 1, levelName: 'Rookie Reader' });
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
      if (image && !isAllowedProfileImageUrl(image, userId)) {
        return { error: 'invalid_image' as const };
      }
      patch.image = image ?? '/default-avatar.jpg';
    }

    const [updated] = await db
      .update(schema.user)
      .set(patch)
      .where(eq(schema.user.id, userId))
      .returning(userSelectFields);

    const xpMap = await userProgressService.getUserXpSummaries([userId]);

    return {
      user: toAdminUserRow(updated, xpMap[userId] ?? { totalXp: 0, level: 1, levelName: 'Rookie Reader' }),
    };
  }
}

export const adminUserService = new AdminUserService();
