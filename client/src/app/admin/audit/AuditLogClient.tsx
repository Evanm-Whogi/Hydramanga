"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Loader2, ExternalLink} from "lucide-react";
import { toast } from "react-toastify";
import { listAuditEvents, type AuditLogEvent, type ListAuditParams } from "@/services/adminAuditService";

const CATEGORIES: { value: ListAuditParams["category"]; label: string }[] = [
  { value: undefined, label: "All categories" },
  { value: "auth", label: "Auth" },
  { value: "admin", label: "Admin" },
  { value: "manga", label: "Manga" },
  { value: "library", label: "Library" },
  { value: "social", label: "Social" },
  { value: "community", label: "Community" },
  { value: "settings", label: "Settings" },
  { value: "moderation", label: "Moderation" },
  { value: "system", label: "System" },
];

/** Shown inline in the row; the rest appears under "Show details". */
const INLINE_META_KEYS = new Set(["summary", "href", "title", "content", "changes"]);

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actorLabel(event: AuditLogEvent): string {
  if (event.actorRole === "anonymous" || !event.actor) {
    return "Anonymous";
  }
  return event.actor.displayUsername || event.actor.username || event.actor.name;
}

function metaString(metadata: Record<string, unknown> | null, key: string): string | null {
  const v = metadata?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function formatMetaValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function eventHref(event: AuditLogEvent): string | null {
  const fromMeta = metaString(event.metadata, "href");
  if (fromMeta) return fromMeta;
  if (!event.resourceType || !event.resourceId) return null;
  if (event.resourceType === "user") return `/users/${event.resourceId}`;
  if (event.resourceType === "series") return `/manga/${event.resourceId}`;
  if (event.resourceType === "board_post") return `/forum/${event.resourceId}`;
  if (event.resourceType === "board_reply") {
    const postId = event.metadata?.postId;
    if (postId != null) return `/forum/${postId}`;
    return "/forum";
  }
  if (event.resourceType === "comment" || event.resourceType === "review") {
    const seriesId = event.metadata?.seriesId;
    if (seriesId != null) return `/manga/${seriesId}`;
  }
  if (event.resourceType === "chat_message") return "/chat";
  if (event.resourceType === "import_request") return "/admin/imports";
  if (event.resourceType === "chapter") {
    const seriesId = event.metadata?.seriesId;
    if (seriesId != null) return `/manga/${seriesId}/read/${event.resourceId}`;
  }
  return null;
}

function linkLabel(event: AuditLogEvent): string | null {
  const href = eventHref(event);
  if (!href) return null;

  const title = metaString(event.metadata, "title");
  const seriesTitle = metaString(event.metadata, "seriesTitle");
  const requestedTitle = metaString(event.metadata, "requestedTitle");

  if (title) return title;
  if (seriesTitle) return seriesTitle;
  if (requestedTitle) return requestedTitle;

  if (event.resourceType === "series" && event.resourceId) {
    return `Manga #${event.resourceId}`;
  }
  if (event.resourceType === "user") {
    if (event.actor) return actorLabel(event);
    return `User #${event.resourceId}`;
  }
  if (event.resourceType === "board_post") {
    return `Board post #${event.resourceId}`;
  }
  if (event.resourceType === "board_reply") {
    return `Board reply #${event.resourceId}`;
  }
  if (event.resourceType === "comment") {
    const seriesId = event.metadata?.seriesId;
    return seriesId != null ? `Manga #${seriesId}` : "Comment";
  }
  if (event.resourceType === "review") {
    const seriesId = event.metadata?.seriesId;
    return seriesId != null ? `Manga #${seriesId}` : "Review";
  }
  if (event.resourceType === "chapter") {
    const chapterNum = event.metadata?.chapterNumber;
    if (seriesTitle && chapterNum != null) {
      return `${seriesTitle} — Ch. ${chapterNum}`;
    }
    return seriesTitle || `Chapter #${event.resourceId}`;
  }
  if (event.action === "manga.view" && seriesTitle) {
    return seriesTitle;
  }
  if (event.resourceType === "import_request") {
    return requestedTitle || `Import #${event.resourceId}`;
  }
  if (event.resourceType === "chat_message") return "Chat";
  if (event.resourceType === "announcement") return "Announcement";

  if (href.startsWith("/admin/imports")) return "Import requests";
  if (href.startsWith("/admin")) return "Admin";
  if (href === "/chat") return "Chat";
  if (href.startsWith("/forum")) return "Forum";
  if (href.startsWith("/manga/")) {
    const id = href.split("/").pop();
    return id ? `Manga #${id}` : "Manga";
  }

  return href.replace(/^\//, "");
}

function eventSummaryDescription(event: AuditLogEvent): string {
  if (event.summary) return event.summary;
  return event.action.replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function inlineSummaryLine(event: AuditLogEvent): string {
  return `${event.action} - ${eventSummaryDescription(event)}`;
}

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function DetailPreview({ event }: { event: AuditLogEvent }) {
  const meta = event.metadata;
  const title = metaString(meta, "title");
  const content = metaString(meta, "content");
  const changes = meta?.changes as Record<string, unknown> | undefined;

  if (!title && !content && !changes) return null;

  return (
    <div className="mt-2 space-y-2 text-sm text-primary border-l-2 border-accent/40 pl-3">
      {title && (
        <p>
          <span className="text-muted font-medium">Title: </span>
          <span className="whitespace-pre-wrap wrap-break-words">{title}</span>
        </p>
      )}
      {content && (
        <p>
          <span className="text-muted font-medium">Content: </span>
          <span className="whitespace-pre-wrap wrap-break-words">{content}</span>
        </p>
      )}
      {changes && Object.keys(changes).length > 0 && (
        <div>
          <span className="text-muted font-medium">Changes: </span>
          <ul className="mt-1 list-disc list-inside text-muted">
            {Object.entries(changes).map(([key, value]) => (
              <li key={key}>
                <span className="text-primary">{humanizeKey(key)}</span>
                {": "}
                <span className="wrap-break-words whitespace-pre-wrap">
                  {formatMetaValue(value)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MetadataFields({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata).filter(([key]) => !INLINE_META_KEYS.has(key));

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted italic">No additional metadata fields beyond the summary above.</p>
    );
  }

  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className={typeof value === "object" ? "sm:col-span-2" : ""}>
          <dt className="font-medium text-muted">{humanizeKey(key)}</dt>
          <dd className="mt-0.5 text-primary wrap-break-words whitespace-pre-wrap">
            {formatMetaValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EventDetailsPanel({ event }: { event: AuditLogEvent }) {
  const meta = event.metadata;

  return (
    <div className="space-y-4 text-sm">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
          Event
        </h4>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
          <div>
            <dt className="text-muted">Action</dt>
            <dd className="font-mono text-primary text-xs">{event.action}</dd>
          </div>
          <div>
            <dt className="text-muted">Category</dt>
            <dd className="text-primary">{event.category}</dd>
          </div>
          <div>
            <dt className="text-muted">Method</dt>
            <dd className="text-primary">{event.method ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Path</dt>
            <dd className="font-mono text-primary text-xs break-all">{event.path ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Resource</dt>
            <dd className="text-primary">
              {event.resourceType && event.resourceId
                ? `${event.resourceType}:${event.resourceId}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Target user</dt>
            <dd className="text-primary font-mono text-xs">{event.targetUserId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">IP address</dt>
            <dd className="text-primary">{event.ipAddress ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">User agent</dt>
            <dd className="text-primary text-xs break-all">{event.userAgent ?? "—"}</dd>
          </div>
        </dl>
      </div>

      {meta && Object.keys(meta).length > 0 && (
        <>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              Metadata fields
            </h4>
            <MetadataFields metadata={meta} />
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              Raw metadata (JSON)
            </h4>
            <pre className="p-3 rounded-lg bg-background border border-borders overflow-x-auto text-xs text-primary font-mono">
              {JSON.stringify(meta, null, 2)}
            </pre>
          </div>
        </>
      )}

      {(!meta || Object.keys(meta).length === 0) && (
        <p className="text-sm text-muted italic">
          This event has no metadata object stored (often older log entries).
        </p>
      )}
    </div>
  );
}

export default function AuditLogClient() {
  const searchParams = useSearchParams();
  const initialActorName = searchParams.get("actorName") ?? "";

  const [events, setEvents] = useState<AuditLogEvent[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ListAuditParams["category"]>();
  const [actorNameInput, setActorNameInput] = useState(initialActorName);
  const [actorNameFilter, setActorNameFilter] = useState(initialActorName);
  const [actionInput, setActionInput] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAuditEvents({
        page,
        limit: 20,
        search: search || undefined,
        category,
        actorName: actorNameFilter || undefined,
        action: actionFilter || undefined,
      });
      setEvents(result.events);
      setTotalPages(result.pagination.totalPages);
      setTotal(result.pagination.total);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [page, search, category, actorNameFilter, actionFilter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setActorNameFilter(actorNameInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [actorNameInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setActionFilter(actionInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [actionInput]);

  useEffect(() => {
    setActorNameInput(initialActorName);
    setActorNameFilter(initialActorName);
    setPage(1);
  }, [initialActorName]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
          <input
            type="search"
            placeholder="Search summary, content, path…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-foreground border border-borders text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <input
          type="text"
          placeholder="Actor name"
          value={actorNameInput}
          onChange={(e) => setActorNameInput(e.target.value)}
          className="w-full lg:w-56 px-3 py-2 rounded-lg bg-foreground border border-borders text-primary text-sm"
        />
        <input
          type="text"
          placeholder="Action prefix (e.g. comment)"
          value={actionInput}
          onChange={(e) => setActionInput(e.target.value)}
          className="w-full lg:w-56 px-3 py-2 rounded-lg bg-foreground border border-borders text-primary text-sm"
        />
        <select
          value={category ?? ""}
          onChange={(e) => {
            setCategory((e.target.value || undefined) as ListAuditParams["category"]);
            setPage(1);
          }}
          className="px-3 py-2 rounded-lg bg-foreground border border-borders text-primary text-sm"
        >
          {CATEGORIES.map(({ value, label }) => (
            <option key={label} value={value ?? ""}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-muted">
        {total} event{total !== 1 ? "s" : ""} total · Admin page views are not logged · Expand a row
        with the arrow on the left for metadata and technical fields
      </p>

      <div className="bg-foreground rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-borders bg-background/50">
                <th className="w-10 px-2 py-3" aria-label="Expand row" />
                <th className="px-4 py-3 font-semibold text-muted">Time</th>
                <th className="px-4 py-3 font-semibold text-muted">Actor</th>
                <th className="px-4 py-3 font-semibold text-muted min-w-[300px]">Summary</th>
                <th className="px-4 py-3 font-semibold text-muted">Link</th>
                <th className="px-4 py-3 font-semibold text-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted">
                    <Loader2 className="size-6 animate-spin inline-block mr-2" />
                    Loading audit log…
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted">
                    No events found
                  </td>
                </tr>
              ) : (
                events.map((event) => {
                  const href = eventHref(event);
                  const isExpanded = expandedId === event.id;

                  return (
                    <Fragment key={event.id}>
                      <tr className="border-b border-borders hover:bg-background/50 transition-colors align-top">
                        <td className="px-2 py-3 align-top">
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : event.id)}
                            className="p-1.5 rounded-md text-muted hover:text-primary hover:bg-background transition-colors"
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? "Hide details" : "Show details"}
                          >
                            {isExpanded ? (
                              <ChevronUp className="size-4" />
                            ) : (
                              <ChevronDown className="size-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-muted whitespace-nowrap">
                          {formatDateTime(event.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-primary font-medium">{actorLabel(event)}</span>
                            {event.actorRole === "anonymous" && (
                              <span className="text-xs text-muted">Anonymous</span>
                            )}
                            {event.impersonator && (
                              <span className="text-xs text-amber-600 dark:text-amber-400">
                                via admin{" "}
                                {event.impersonator.displayUsername || event.impersonator.name}
                              </span>
                            )}
                            {event.actor && event.actorRole !== "anonymous" && (
                              <Link
                                href={`/admin/audit?actorName=${encodeURIComponent(actorLabel(event))}`}
                                className="text-xs text-accent hover:underline"
                              >
                                Filter actor
                              </Link>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-xl">
                          <p className="font-medium text-primary">{inlineSummaryLine(event)}</p>
                          <DetailPreview event={event} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap max-w-[200px]">
                          {href && linkLabel(event) ? (
                            <Link
                              href={href}
                              target="_blank"
                              className="inline-flex items-center gap-1 text-accent hover:underline text-sm max-w-full"
                              title={href}
                            >
                              <span className="truncate">{linkLabel(event)}</span>
                              <ExternalLink className="size-3.5 shrink-0" />
                            </Link>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                              event.success
                                ? "bg-green-500/15 text-green-600 dark:text-green-400"
                                : "bg-red-500/15 text-red-600 dark:text-red-400"
                            }`}
                          >
                            {event.statusCode ?? (event.success ? "OK" : "Fail")}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-borders bg-background/40">
                          <td colSpan={6} className="px-4 py-4">
                            <EventDetailsPanel event={event} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="p-2 rounded-lg bg-foreground border border-borders disabled:opacity-40 hover:bg-background transition-colors"
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
            className="p-2 rounded-lg bg-foreground border border-borders disabled:opacity-40 hover:bg-background transition-colors"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
