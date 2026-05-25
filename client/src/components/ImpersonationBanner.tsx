"use client";

import { useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { toast } from "react-toastify";
import { authClient } from "@/lib/auth";

export default function ImpersonationBanner() {
  const { data: sessionData } = authClient.useSession();
  const [stopping, setStopping] = useState(false);

  const session = sessionData?.session;
  const user = sessionData?.user;
  const impersonatedBy = session?.impersonatedBy;

  if (!impersonatedBy) return null;

  const handleStop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      const { error } = await authClient.admin.stopImpersonating();
      if (error) throw new Error(error.message);
      toast.success("Returned to your account");
      window.location.href = "/home";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to exit impersonation");
      setStopping(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleStop}
      disabled={stopping}
      aria-label="Exit impersonation and return to your account"
      className="fixed top-0 left-0 right-0 z-60 w-full bg-foreground text-primary px-4 py-2.5 shadow-md border-b border-accent hover:bg-background active:bg-background transition-colors disabled:opacity-70 disabled:cursor-wait cursor-pointer"
    >
      <div className="container mx-auto flex items-center justify-center gap-2 text-sm font-medium">
        <ShieldAlert className="size-4 shrink-0" aria-hidden />
        <span>
          {stopping ? (
            "Returning to your account…"
          ) : (
            <>
              Viewing as <strong>{user?.name}</strong> — click anywhere on this bar to return to your
              account
            </>
          )}
        </span>
        {!stopping && <X className="size-4 shrink-0 opacity-70" aria-hidden />}
      </div>
    </button>
  );
}
