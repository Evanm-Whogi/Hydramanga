import { authClient } from "@/lib/auth";
import { headers } from "next/headers";

type Session = typeof authClient.$Infer.Session;

  export async function useSession(): Promise<Session | null> {
      const session = await authClient.getSession({
          fetchOptions: { headers: await headers() }
      });

      return session.data; 
  }