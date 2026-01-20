// lib/auth.ts
import { createAuthClient } from "better-auth/react";
import { nextCookies } from "better-auth/next-js";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { getBackendInternalUrl } from "./env";


export const authClient = createAuthClient({
    // Client components use Next rewrite (/api/auth); server components hit backend directly
    baseURL: typeof window === "undefined" 
        ? `${getBackendInternalUrl()}`
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