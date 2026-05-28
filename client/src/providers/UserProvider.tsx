"use client";

import { createContext, useContext, ReactNode } from "react";
import { authClient } from "@/lib/auth";

type Session = typeof authClient.$Infer.Session;

interface UserContextType {
  user: Session["user"] | null;
  session: Session["session"] | null;
  isPending: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ 
  children, 
  initialSession 
}: { 
  children: ReactNode;
  initialSession: Session | null; 
}) {
  const { data: liveSession, isPending } = authClient.useSession();
  const currentSession = liveSession || initialSession;

  return (
    <UserContext.Provider 
      value={{
        user: currentSession?.user ?? null,
        session: currentSession?.session ?? null,
        isPending: isPending && !initialSession,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};