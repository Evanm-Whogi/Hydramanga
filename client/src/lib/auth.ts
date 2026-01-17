// lib/auth.ts
import { createAuthClient } from "better-auth/react";
import { nextCookies } from "better-auth/next-js";
import { inferAdditionalFields } from "better-auth/client/plugins";


export const authClient = createAuthClient({
    // This is a bit weird but for clientSide Components we fetch using the rewrite /api/auth and for server components we fetch through the backend url directly.
    baseURL: typeof window === "undefined" 
        ? "http://localhost:3001" 
        : `${window.location.origin}/api/auth`,
    basePath: "/auth",
    plugins: [
        nextCookies(), 
        inferAdditionalFields({
            user: {
                role: { type: "string" },
                bio: { type: "string" },
            }
        })
    ],
    session: {
        cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
});

// Correct: Destructure from the existing authClient variable
export const { signIn, signUp, useSession, signOut, updateUser, changePassword, changeEmail, sendVerificationEmail, listSessions, revokeSession } = authClient;