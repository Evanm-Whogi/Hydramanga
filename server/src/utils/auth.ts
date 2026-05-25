import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "@/db/index";
import { emailService } from "@/services/emailService";
import { discordService } from "@/services/discordService";
import { eq, sql } from "drizzle-orm";

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${PUBLIC_APP_URL}/api/auth/callback/google`;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || `${PUBLIC_APP_URL}/api/auth/callback/discord`;
 
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
    trustedOrigins: [PUBLIC_APP_URL],
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
                username: user.name,
                resetLink,
                appName: process.env.PUBLIC_NAME || "Mang",
                year: new Date().getFullYear(),
            });
        },
    },
    plugins: [
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
                username: user.name,
                verificationLink: url,
                customUrl: `${PUBLIC_APP_URL}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(`${PUBLIC_APP_URL}/profile?verified=true`)}`
            });
        }
    },
    databaseHooks: {
        user: {
            create: {
                before: async (user: any) => {
                    return {
                        data: {
                            ...user,
                            role: 'user',
                        },
                    };
                },
                after: async (user: any) => {
                    await discordService.notifyUserSignup(user.name || 'Unknown', user.id);

                    const result = await db
                        .select({ count: sql<number>`count(*)` })
                        .from(schema.user);
                    const userCount = Number(result[0]?.count ?? 0);

                    if (userCount === 1 && user.role !== 'admin') {
                        await db
                            .update(schema.user)
                            .set({ role: 'admin' })
                            .where(eq(schema.user.id, user.id));
                    }
                }
            }
        }
    },
})