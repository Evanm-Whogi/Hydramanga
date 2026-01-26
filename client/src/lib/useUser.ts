import { authClient } from "@/lib/auth";
import { headers } from "next/headers";

type Session = typeof authClient.$Infer.Session;

export async function useSession(): Promise<Session | null> {
    try {
        const session = await authClient.getSession({
            fetchOptions: { headers: await headers() }
        });
        return session.data;
    } catch (error: any) {
        // For connection errors, just return null and let pages handle it
        // Don't redirect here to avoid infinite loops
        console.log('Session error:', error.message || error); // log instead of error 
        return null;
    }
}