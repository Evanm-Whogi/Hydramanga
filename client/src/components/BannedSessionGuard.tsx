"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth";
import { isUserBanned } from "@/lib/banHelpers";
import { signOutIfBannedUser } from "@/lib/authSession";

/** Signs out and redirects if the cached session still shows a banned user. */
export default function BannedSessionGuard() {
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const user = session?.user;
    if (!user || !isUserBanned(user)) return;
    void signOutIfBannedUser(user);
  }, [session?.user]);

  return null;
}
