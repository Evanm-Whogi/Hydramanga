"use client";

import { createContext, useContext, ReactNode, useState, useEffect } from "react";
import { authClient } from "@/lib/auth";
import { identifyUser, clearUser } from "@/lib/analytics";

type Session = typeof authClient.$Infer.Session;

interface UserContextType {
  user: Session["user"] | null;
  session: Session | null;
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

  // Track user identification for PostHog
  useEffect(() => {
    if (currentSession?.user) {
      identifyUser(currentSession.user.id, {
        email: currentSession.user.email,
        name: currentSession.user.name,
        created_at: currentSession.user.createdAt,
        role: currentSession.user.role,
      });
    } else {
      clearUser();
    }
  }, [currentSession?.user?.id]);

  return (
    <UserContext.Provider 
      value={{ 
        user: currentSession?.user ?? null, 
        session: currentSession ?? null,
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