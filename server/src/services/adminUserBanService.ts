import { db, schema } from '@/db/index';
import { auth } from '@/utils/auth';
import { isUserBanned } from '@/lib/banHelpers';
import { eq } from 'drizzle-orm';
import type { IncomingHttpHeaders } from 'http';
import { fromNodeHeaders } from 'better-auth/node';

export interface BanUserOptions {
  banReason?: string;
  /** Duration in seconds; omit for permanent ban */
  banExpiresIn?: number;
}

class AdminUserBanService {
  private async getTarget(userId: string) {
    const [row] = await db
      .select({
        id: schema.user.id,
        role: schema.user.role,
        banned: schema.user.banned,
        banReason: schema.user.banReason,
        banExpires: schema.user.banExpires,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    return row ?? null;
  }

  async banUser(targetUserId: string, adminUserId: string, headers: IncomingHttpHeaders, options: BanUserOptions): Promise<{ ok: true } | { error: string }> {
    if (targetUserId === adminUserId) {
      return { error: 'cannot_ban_self' };
    }

    const target = await this.getTarget(targetUserId);
    if (!target) return { error: 'not_found' };
    if (target.role === 'admin') return { error: 'cannot_ban_admin' };
    if (isUserBanned(target)) return { error: 'already_banned' };

    const reason = options.banReason?.trim() || 'Banned by administrator';

    await auth.api.banUser({
      body: {
        userId: targetUserId,
        banReason: reason,
        banExpiresIn: options.banExpiresIn,
      },
      headers: fromNodeHeaders(headers),
    });

    return { ok: true };
  }

  async unbanUser(targetUserId: string, headers: IncomingHttpHeaders): Promise<{ ok: true } | { error: string }> {
    const target = await this.getTarget(targetUserId);
    if (!target) return { error: 'not_found' };
    if (!isUserBanned(target)) return { error: 'not_banned' };

    await auth.api.unbanUser({
      body: { userId: targetUserId },
      headers: fromNodeHeaders(headers),
    });

    return { ok: true };
  }
}

export const adminUserBanService = new AdminUserBanService();
