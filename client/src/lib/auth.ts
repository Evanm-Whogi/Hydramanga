// lib/auth.ts
import { createAuthClient } from "better-auth/react";
import { nextCookies } from "better-auth/next-js";
import { inferAdditionalFields, adminClient, usernameClient } from "better-auth/client/plugins";
import { getBackendInternalUrl } from "./env";


export const authClient = createAuthClient({
    // Client components use Next rewrite (/api/auth); server components hit backend directly
    baseURL: typeof window === "undefined" 
        ? `${getBackendInternalUrl()}`
        : `${window.location.origin}/api/auth`,
    basePath: "/auth",
    plugins: [
        nextCookies(),
        usernameClient(),
        adminClient(),
        inferAdditionalFields({
            user: {
                // Set server-side only (admin plugin: role input=false; hooks assign defaults)
                role: { type: "string", required: false },
                bio: { type: "string", required: false },
                banned: { type: "boolean", required: false },
                banReason: { type: "string", required: false },
                banExpires: { type: "date", required: false },
            },
            session: {
                impersonatedBy: { type: "string", required: false },
            },
        }),
    ],
    session: {
        cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
});

// Correct: Destructure from the existing authClient variable
export const {
    signIn,
    signUp,
    isUsernameAvailable,
    useSession,
    signOut,
    updateUser,
    changePassword,
    changeEmail,
    sendVerificationEmail,
    requestPasswordReset,
    resetPassword,
    listSessions,
    revokeSession,
} = authClient;