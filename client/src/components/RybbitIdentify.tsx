"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@/providers/UserProvider";
import { clearRybbitUser, consumePendingOAuthRegister, identifyRybbitUser, isRecentSignup, trackUserRegister, updateRybbitTraits, whenRybbitReady } from "@/lib/rybbit";

export default function RybbitIdentify() {
  const { user, isPending } = useUser();
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isPending) return;

    return whenRybbitReady(() => {
      if (user) {
        if (previousUserIdRef.current === user.id) {
          updateRybbitTraits(user);
        } else {
          identifyRybbitUser(user);

          const oauthProvider = consumePendingOAuthRegister();
          if (oauthProvider && isRecentSignup(user.createdAt)) {
            trackUserRegister(oauthProvider);
          }
        }
        previousUserIdRef.current = user.id;
        return;
      }

      if (previousUserIdRef.current) {
        clearRybbitUser();
      }
      previousUserIdRef.current = null;
    });
  }, [
    user,
    isPending,
    user?.id,
    user?.username,
    user?.displayUsername,
    user?.name,
    user?.email,
    user?.role,
  ]);

  return null;
}
