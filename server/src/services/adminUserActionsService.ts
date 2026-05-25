import { db, schema } from '@/db/index';
import { auth } from '@/utils/auth';
import { and, eq } from 'drizzle-orm';

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:3000';

class AdminUserActionsService {
  async getUserEmail(userId: string): Promise<string | null> {
    const [row] = await db
      .select({ email: schema.user.email, emailVerified: schema.user.emailVerified })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    if (!row) return null;
    return row.email;
  }

  async getUserAccountInfo(userId: string) {
    const [user] = await db
      .select({
        id: schema.user.id,
        email: schema.user.email,
        emailVerified: schema.user.emailVerified,
        role: schema.user.role,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    if (!user) return null;

    const [credential] = await db
      .select({ id: schema.account.id })
      .from(schema.account)
      .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, 'credential')))
      .limit(1);

    return {
      ...user,
      hasCredentialAccount: Boolean(credential),
    };
  }

  async sendVerificationEmail(userId: string): Promise<{ ok: true } | { error: string }> {
    const info = await this.getUserAccountInfo(userId);
    if (!info) return { error: 'not_found' };
    if (info.emailVerified) return { error: 'already_verified' };

    await auth.api.sendVerificationEmail({
      body: {
        email: info.email,
        callbackURL: `${PUBLIC_APP_URL}/profile?verified=true`,
      },
    });

    return { ok: true };
  }

  async sendPasswordReset(userId: string): Promise<{ ok: true } | { error: string }> {
    const info = await this.getUserAccountInfo(userId);
    if (!info) return { error: 'not_found' };
    if (!info.hasCredentialAccount) return { error: 'no_credential_account' };

    await auth.api.requestPasswordReset({
      body: {
        email: info.email,
        redirectTo: `${PUBLIC_APP_URL}/reset-password`,
      },
    });

    return { ok: true };
  }
}

export const adminUserActionsService = new AdminUserActionsService();
