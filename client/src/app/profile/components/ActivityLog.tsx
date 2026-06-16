"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Shield } from "lucide-react";
import { getMyAuthActivity, type MyAuditEvent } from "@/services/auditService";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActivityLog(_props: { user?: unknown; isOwner?: boolean }) {
  const [events, setEvents] = useState<MyAuditEvent[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMyAuthActivity({ page, limit: 15 });
      setEvents(result.events);
      setTotalPages(result.pagination.totalPages);
    } catch (error) {
      console.error("Failed to load account activity", error);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  return (
    <div className="bg-foreground rounded-lg p-6 space-y-4 w-full shadow-md">
      <div className="flex items-start gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary">Account activity</h2>
          <p className="text-sm text-muted mt-1">
            Sign-in, registration, password, and other security-related events on your account.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted">
          <Loader2 className="size-6 animate-spin mr-2" />
          Loading activity…
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted py-8 text-center">No account activity recorded yet.</p>
      ) : (
        <ul className="divide-y divide-borders">
          {events.map((event) => (
            <li key={event.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-primary font-medium">
                  {event.summary ?? event.action}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {formatDateTime(event.createdAt)}
                  {event.ipAddress ? ` · ${event.ipAddress}` : ""}
                </p>
              </div>
              <span
                className={`self-start sm:self-center inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                  event.success
                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : "bg-red-500/15 text-red-600 dark:text-red-400"
                }`}
              >
                {event.success ? "Success" : "Failed"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="p-2 rounded-lg bg-background border border-borders disabled:opacity-40"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="text-sm text-muted">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="p-2 rounded-lg bg-background border border-borders disabled:opacity-40"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
