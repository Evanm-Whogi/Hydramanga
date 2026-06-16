"use client";

import { useEffect, useState } from "react";
import { useSession, listSessions, revokeSession } from "@/lib/auth";
import { toast } from "react-toastify";
import ActivityLog from "@/app/profile/components/ActivityLog";

export default function Activity(_props: { user?: unknown; isOwner?: boolean }) {
  const { data: activeSession } = useSession();
  const [sessions, setSessions] = useState<any[]>([]);

  const fetchSessions = async () => {
    const { data } = await listSessions();
    if (data) setSessions(data);
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevokeSession = async (token: string) => {
    try {
      const { error } = await revokeSession({ token });
      if (error) throw new Error(error.message);
      toast.success("Session revoked");
      fetchSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke session");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <ActivityLog />

      <div className="flex flex-col w-full bg-foreground p-5 rounded-md shadow-md">
        <h1 className="text-xl font-bold">Active Sessions</h1>
        <p className="text-sm text-muted mb-4">Manage and revoke your active sessions across different devices.</p>

        <div className="flex flex-col space-y-3">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted py-4 text-center">No active sessions found.</p>
          ) : (
            sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between bg-background/50 p-4 rounded-lg border border-white/5 shadow-md">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-background rounded-full">
                    <span className="text-xs uppercase font-bold">{session.userAgent?.includes("Windows") ? "Win" : "Mob"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {session.userAgent || "Unknown Device"}
                      {session.id === activeSession?.session.id && (
                        <span className="ml-2 text-xs bg-green-500/20 text-green-500 px-2 py-0.5 rounded-full">Current</span>
                      )}
                    </span>
                    <div className="text-xs text-muted">
                      IP: {session.ipAddress || "Unknown"} &#8226; Last active: {new Date(session.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {session.id !== activeSession?.session.id && (
                  <button onClick={() => handleRevokeSession(session.token)} className="text-sm text-red-500 hover:text-red-400 font-medium">Revoke</button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
