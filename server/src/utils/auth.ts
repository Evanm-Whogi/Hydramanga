import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/index";
import { emailService } from "@/services/emailService";

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${PUBLIC_APP_URL}/api/auth/callback/google`;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || `${PUBLIC_APP_URL}/api/auth/callback/discord`;
 
export const auth = betterAuth({
    // Public site URL (frontend) used for links and redirects
    baseURL: PUBLIC_APP_URL,
    basePath: "/auth",
    advanced: {
        // Use secure cookies only in production; allow HTTP in development
        useSecureCookies: process.env.NODE_ENV === 'production'
    },
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [PUBLIC_APP_URL],
    database: drizzleAdapter(db, {
        provider: "mysql",
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
        minPasswordLength: 4,
        maxPasswordLength: 26,
        requireEmailVerification: false,
        autoSignIn: true
    },
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
        level: "debug",
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
    }
})