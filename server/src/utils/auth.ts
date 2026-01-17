import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/index";
import { emailService } from "@/services/emailService";
 
export const auth = betterAuth({
    baseURL: "http://localhost:3000",
    basePath: "/auth",
    advanced: {
        useSecureCookies: false // Set to true only in production (HTTPS)
    },
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [
        "http://localhost:3000",
        "http://localhost:3001"
    ],
    database: drizzleAdapter(db, {
        provider: "mysql",
    }),
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            redirectURI: "http://localhost:3001/auth/callback/google",
        },
        discord: {
            clientId: process.env.DISCORD_CLIENT_ID!,
            clientSecret: process.env.DISCORD_CLIENT_SECRET!,
            redirectURI: "http://localhost:3001/auth/callback/discord",
        },
    },
    emailAndPassword: { 
        enabled: true, 
        minPasswordLength: 4,
        maxPasswordLength: 26,
        requireEmailVerification: true,
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
                customUrl: `http://localhost:3000/api/auth/verify-email?token=${token}&callbackURL=http%3A%2F%2Flocalhost%3A3000%2Fprofile%3Fverified%3Dtrue`
            });
        }
    }
})