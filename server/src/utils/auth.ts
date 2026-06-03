import { betterAuth } from "better-auth";
import { admin, username } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "@/db/index";
import { emailService } from "@/services/emailService";
import { discordService } from "@/services/discordService";
import { eq, sql } from "drizzle-orm";
import { auditLogService } from "@/services/auditLogService";
import { siteSettingsService } from "@/services/siteSettingsService";
import { fromNodeHeaders } from "better-auth/node";

function getRequestMeta(context: { request?: Request } | null | undefined) {
    const headers = context?.request?.headers;
    if (!headers) return { ipAddress: null as string | null, userAgent: null as string | null };
    const forwarded = headers.get('x-forwarded-for');
    let ipAddress = forwarded?.split(',')[0]?.trim() || headers.get('x-real-ip') || null;
    if (ipAddress?.startsWith('::ffff:')) ipAddress = ipAddress.substring(7);
    return {
        ipAddress,
        userAgent: headers.get('user-agent'),
    };
}

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${PUBLIC_APP_URL}/auth/callback/google`;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || `${PUBLIC_APP_URL}/auth/callback/discord`;
 
export const auth = betterAuth({
    // Public site URL (frontend) used for links and redirects
    baseURL: PUBLIC_APP_URL,
    basePath: "/auth",
    advanced: {
        useSecureCookies: true,
    },
    cookies: {
        sessionToken: {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60, // 7 days
        }
    },
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [PUBLIC_APP_URL, 'http://localhost:3000'],
    database: drizzleAdapter(db, {
        provider: "pg",
    }),
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            redirectURI: GOOGLE_REDIRECT_URI,
        },
        discord: {
            clientId: process.env.DISCORD_CLIENT_ID!,
            clientSecret: process.env.DISCORD_CLIENT_SECRET!,
            redirectURI: DISCORD_REDIRECT_URI,
        },
    },
    emailAndPassword: { 
        enabled: true, 
        minPasswordLength: 8,
        maxPasswordLength: 32,
        requireEmailVerification: false,
        autoSignIn: true,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ user, token }) => {
            const callbackURL = encodeURIComponent(`${PUBLIC_APP_URL}/reset-password`);
            const resetLink = `${PUBLIC_APP_URL}/api/auth/reset-password/${token}?callbackURL=${callbackURL}`;
            await emailService.sendEmail(user.email, "resetPassword", "Reset your password", {
                username: (user as { username?: string }).username || user.name,
                resetLink,
                appName: process.env.PUBLIC_NAME || "Mang",
                year: new Date().getFullYear(),
            });
        },
    },
    plugins: [
        username({
            minUsernameLength: 3,
            maxUsernameLength: 30,
        }),
        admin({
            defaultRole: "user",
            adminRoles: ["admin"],
            impersonationSessionDuration: 60 * 60,
            bannedUserMessage:
                "Your account has been suspended. Contact support if you believe this is an error.",
        }),
    ],
    account: {
        accountLinking: {
            enabled: true,
        }
    },
    session: {
        enabled: true,
        cookieCache: {
            maxAge: 60 * 5 // 5 minutes
        }
    },
    logger: {
        level: "warn",
        enabled: true,
    },
    user: {
        additionalFields: {
            role: {
                type: "string",
                required: false,
            },
            bio: {
                type: "string",
                required: false,
            },
            banned: {
                type: "boolean",
                required: false,
            },
            banReason: {
                type: "string",
                required: false,
            },
            banExpires: {
                type: "date",
                required: false,
            },
        },
        changeEmail: {
            enabled: true,
            verifyEmailOnUpdate: false, 
        }

    },
    emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        expirationMinutes: 60 * 24, // 24 hours
        sendVerificationEmail: async ({ user, url, token }, request) => {
            await emailService.sendEmail(user.email, "verifyEmail", "Verify your email address", { 
                username: (user as { username?: string }).username || user.name,
                verificationLink: url,
                customUrl: `${PUBLIC_APP_URL}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(`${PUBLIC_APP_URL}/users/me?verified=true`)}`
            });
        }
    },
    databaseHooks: {
        user: {
            create: {
                before: async (user: any, context) => {
                    const path = context?.path as string | undefined;
                    const settings = await siteSettingsService.getSettings();
                    if (!settings.registrationEnabled) {
                        const rawHeaders = context?.request?.headers as Headers | undefined;
                        let isAdminActor = false;
                        if (rawHeaders) {
                            const nodeHeaders = Object.fromEntries(rawHeaders.entries());
                            const actorSession = await auth.api.getSession({ headers: fromNodeHeaders(nodeHeaders) });
                            isAdminActor = (actorSession?.user as { role?: string } | undefined)?.role === 'admin';
                        }
                        if (!isAdminActor) {
                            throw new Error('Registration is currently disabled.');
                        }
                    }

                    let nextUser = { ...user, role: 'user' as const };

                    if (path === '/sign-up/email') {
                        const rawUsername =
                            typeof nextUser.username === 'string' ? nextUser.username.trim() : '';
                        if (!rawUsername) {
                            throw new Error('Username is required');
                        }
                        const display =
                            typeof nextUser.displayUsername === 'string' && nextUser.displayUsername.trim()
                                ? nextUser.displayUsername.trim()
                                : rawUsername;
                        nextUser = {
                            ...nextUser,
                            displayUsername: display,
                            name: display,
                        };
                    } else if (!nextUser.username && typeof nextUser.email === 'string') {
                        const base = nextUser.email
                            .split('@')[0]
                            .replace(/[^a-zA-Z0-9_.]/g, '_')
                            .slice(0, 20) || 'user';
                        let candidate = base.toLowerCase();
                        let suffix = 0;
                        while (
                            (
                                await db
                                    .select({ id: schema.user.id })
                                    .from(schema.user)
                                    .where(eq(schema.user.username, candidate))
                                    .limit(1)
                            ).length > 0
                        ) {
                            suffix += 1;
                            candidate = `${base.toLowerCase()}${suffix}`;
                        }
                        nextUser = {
                            ...nextUser,
                            username: candidate,
                            displayUsername: nextUser.displayUsername || base,
                            name: nextUser.name || nextUser.displayUsername || base,
                        };
                    } else if (nextUser.username) {
                        const display =
                            nextUser.displayUsername ||
                            nextUser.name ||
                            nextUser.username;
                        nextUser = { ...nextUser, name: display };
                    }

                    return { data: nextUser };
                },
                after: async (user: any, context) => {
                    const meta = getRequestMeta(context);
                    const path = (context as { path?: string })?.path ?? '';

                    await auditLogService.record({
                        actorId: user.id,
                        impersonatorId: null,
                        actorRole: 'user',
                        action: 'auth.register',
                        category: 'auth',
                        resourceType: 'user',
                        resourceId: user.id,
                        path: path ? `/auth${path}` : '/auth/sign-up',
                        success: true,
                        ipAddress: meta.ipAddress,
                        userAgent: meta.userAgent,
                        skipDedup: true,
                        metadata: {
                            isAnonymous: false,
                            provider: path.includes('social') ? 'oauth' : 'email',
                        },
                    });

                    await discordService.notifyUserSignup(
                        user.displayUsername || user.username || user.name || 'Unknown',
                        user.id
                    );

                    const bootstrapEmails = (process.env.BOOTSTRAP_ADMIN_EMAILS ?? '')
                        .split(',')
                        .map((e) => e.trim().toLowerCase())
                        .filter(Boolean);
                    const userEmail =
                        typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';

                    if (
                        bootstrapEmails.length > 0 &&
                        userEmail &&
                        bootstrapEmails.includes(userEmail) &&
                        user.role !== 'admin'
                    ) {
                        await db
                            .update(schema.user)
                            .set({ role: 'admin' })
                            .where(eq(schema.user.id, user.id));
                    }
                },
            },
            update: {
                before: async (user: any) => {
                    if (typeof user.username !== 'string') {
                        return { data: user };
                    }
                    const display =
                        typeof user.displayUsername === 'string' && user.displayUsername.trim()
                            ? user.displayUsername.trim()
                            : user.username;
                    return {
                        data: {
                            ...user,
                            name: display,
                        },
                    };
                },
            },
        },
        session: {
            create: {
                after: async (session: { userId: string; impersonatedBy?: string | null }, context) => {
                    const meta = getRequestMeta(context);
                    const path = (context as { path?: string })?.path ?? '';

                    if (session.impersonatedBy) {
                        await auditLogService.record({
                            actorId: session.userId,
                            impersonatorId: session.impersonatedBy,
                            actorRole: 'user',
                            action: 'auth.impersonation_start',
                            category: 'auth',
                            resourceType: 'user',
                            resourceId: session.userId,
                            targetUserId: session.userId,
                            path: path ? `/auth${path}` : null,
                            success: true,
                            ipAddress: meta.ipAddress,
                            userAgent: meta.userAgent,
                            skipDedup: true,
                            metadata: { isAnonymous: false },
                        });
                        return;
                    }

                    const [actor] = await db
                        .select({ role: schema.user.role })
                        .from(schema.user)
                        .where(eq(schema.user.id, session.userId))
                        .limit(1);

                    await auditLogService.record({
                        actorId: session.userId,
                        impersonatorId: null,
                        actorRole: actor?.role === 'admin' ? 'admin' : 'user',
                        action: 'auth.login',
                        category: 'auth',
                        resourceType: 'session',
                        resourceId: (session as { id?: string }).id ?? null,
                        path: path ? `/auth${path}` : '/auth/sign-in',
                        success: true,
                        ipAddress: meta.ipAddress,
                        userAgent: meta.userAgent,
                        skipDedup: true,
                        metadata: {
                            isAnonymous: false,
                            provider: path.includes('callback') ? 'oauth' : 'credentials',
                        },
                    });
                },
            },
            delete: {
                after: async (session: { userId: string; impersonatedBy?: string | null }, context) => {
                    const meta = getRequestMeta(context);
                    const path = (context as { path?: string })?.path ?? '';

                    if (session.impersonatedBy) {
                        await auditLogService.record({
                            actorId: session.userId,
                            impersonatorId: session.impersonatedBy,
                            actorRole: 'user',
                            action: 'auth.impersonation_end',
                            category: 'auth',
                            resourceType: 'user',
                            resourceId: session.userId,
                            path: path ? `/auth${path}` : null,
                            success: true,
                            ipAddress: meta.ipAddress,
                            userAgent: meta.userAgent,
                            skipDedup: true,
                            metadata: { isAnonymous: false },
                        });
                        return;
                    }

                    await auditLogService.record({
                        actorId: session.userId,
                        impersonatorId: null,
                        actorRole: 'user',
                        action: 'auth.logout',
                        category: 'auth',
                        resourceType: 'session',
                        resourceId: (session as { id?: string }).id ?? null,
                        path: path ? `/auth${path}` : '/auth/sign-out',
                        success: true,
                        ipAddress: meta.ipAddress,
                        userAgent: meta.userAgent,
                        skipDedup: true,
                        metadata: { isAnonymous: false },
                    });
                },
            },
        },
    },
})