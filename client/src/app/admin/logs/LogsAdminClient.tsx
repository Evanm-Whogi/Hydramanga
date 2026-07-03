"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Maximize2, Minimize2, RefreshCw, Search, Terminal } from "lucide-react";
import { toast } from "react-toastify";
import { getAdminContainerLogs, getAdminLogContainers, type AdminDockerContainerRow, type AdminDockerLogTail } from "@/services/adminDockerLogService";
import { filterByLogLevel, filterFormattedLogLines, formatDockerLogLines, getDockerLogLineClass, type LogLevelFilter } from "@/lib/dockerLogFormat";

const TAIL_OPTIONS: { value: AdminDockerLogTail; label: string }[] = [
  { value: 100, label: "100 lines" },
  { value: 500, label: "500 lines" },
  { value: 1000, label: "1000 lines" },
  { value: "all", label: "All" },
];

const LEVEL_OPTIONS: { value: LogLevelFilter; label: string }[] = [
  { value: "error", label: "ERROR" },
  { value: "warn", label: "WARN" },
  { value: "info", label: "INFO" },
  { value: "debug", label: "DEBUG" },
  { value: "trace", label: "TRACE" },
  { value: "monitor", label: "MONITOR" },
];

function stateBadgeClass(state: string): string {
  if (state === "running") return "bg-green-500/20 text-green-400";
  if (state === "exited") return "bg-red-500/20 text-red-400";
  if (state === "restarting") return "bg-amber-500/20 text-amber-400";
  return "bg-background text-muted";
}

function LogLineList({ lines, loading }: { lines: ReturnType<typeof formatDockerLogLines>; loading: boolean }) {
  if (lines.length === 0) {
    return <p className="text-sm text-muted py-8 text-center">{loading ? "" : "(no log output)"}</p>;
  }
  return (
    <div className="space-y-0.5">
      {lines.map((line, index) => (
        <div key={`${index}-${line.text.slice(0, 40)}`} className={`whitespace-pre-wrap break-all ${getDockerLogLineClass(line.level)}`}>
          {line.text}
        </div>
      ))}
    </div>
  );
}

export default function LogsAdminClient() {
  const [available, setAvailable] = useState(true);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [containers, setContainers] = useState<AdminDockerContainerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logLines, setLogLines] = useState("");
  const [tail, setTail] = useState<AdminDockerLogTail>(500);
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<LogLevelFilter>("info");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loadingContainers, setLoadingContainers] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const logPanelRef = useRef<HTMLDivElement>(null);

  const selectedContainer = useMemo(
    () => containers.find((c) => c.id === selectedId) ?? null,
    [containers, selectedId],
  );

  const fetchContainers = useCallback(async (silent = false) => {
    if (!silent) setLoadingContainers(true);
    else setRefreshing(true);
    try {
      const result = await getAdminLogContainers();
      setAvailable(result.available);
      setUnavailableMessage(result.message ?? null);
      setContainers(result.containers);
      setSelectedId((prev) => {
        if (prev && result.containers.some((c) => c.id === prev)) return prev;
        return result.containers[0]?.id ?? null;
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to load containers");
    } finally {
      setLoadingContainers(false);
      setRefreshing(false);
    }
  }, []);

  const fetchLogs = useCallback(async (containerId: string, silent = false) => {
    if (!silent) setLoadingLogs(true);
    try {
      const result = await getAdminContainerLogs(containerId, { tail });
      if (!result.available) {
        setLogLines("");
        if (result.message) setUnavailableMessage(result.message);
        return;
      }
      setLogLines(result.lines ?? "");
    } catch (err) {
      console.error(err);
      toast.error("Failed to load container logs");
    } finally {
      setLoadingLogs(false);
    }
  }, [tail]);

  useEffect(() => {
    fetchContainers();
  }, [fetchContainers]);

  useEffect(() => {
    if (!selectedId || !available) return;
    fetchLogs(selectedId);
  }, [selectedId, available, fetchLogs]);

  useEffect(() => {
    if (!autoRefresh || !selectedId || !available) return;
    const interval = setInterval(() => {
      fetchContainers(true);
      fetchLogs(selectedId, true);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedId, available, fetchContainers, fetchLogs]);

  const handleRefresh = async () => {
    await fetchContainers(true);
    if (selectedId) await fetchLogs(selectedId, true);
  };

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFullscreen]);

  const formattedLogLines = useMemo(() => formatDockerLogLines(logLines), [logLines]);
  const displayedLogLines = useMemo(
    () => filterFormattedLogLines(filterByLogLevel(formattedLogLines, levelFilter), searchQuery),
    [formattedLogLines, levelFilter, searchQuery],
  );

  return (
    <div className="space-y-4">
      {!available && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="size-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-primary font-medium">Docker logs unavailable</p>
            <p className="text-sm text-muted mt-1">
              {unavailableMessage ?? "The server cannot access the Docker socket. This feature works when the server container has /var/run/docker.sock mounted."}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 min-h-[560px]">
        <div className="bg-foreground/50 rounded-lg p-4 border border-borders/30 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-sm font-semibold text-primary flex items-center gap-2">
              <Terminal className="size-4" />
              Containers
            </h2>
            <button
              type="button"
              onClick={() => fetchContainers(true)}
              disabled={loadingContainers || refreshing}
              className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-background transition-colors disabled:opacity-50"
              title="Refresh containers"
            >
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {loadingContainers ? (
            <div className="flex items-center justify-center py-12 text-muted">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : containers.length === 0 ? (
            <p className="text-sm text-muted py-4">No containers found for this compose project.</p>
          ) : (
            <ul className="space-y-1 overflow-y-auto flex-1">
              {containers.map((container) => {
                const active = container.id === selectedId;
                return (
                  <li key={container.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(container.id)}
                      className={`w-full text-left rounded-lg px-3 py-2.5 border transition-colors ${
                        active
                          ? "bg-accent/20 border-accent/40 text-primary"
                          : "border-transparent hover:bg-background text-primary"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{container.service}</span>
                        <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${stateBadgeClass(container.state)}`}>
                          {container.state}
                        </span>
                      </div>
                      <p className="text-xs text-muted/70 font-mono mt-0.5 truncate">{container.name}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={isFullscreen ? "fixed inset-0 z-50 m-0 rounded-none p-4 bg-background border-0 flex flex-col" : "bg-foreground/50 rounded-lg p-4 border border-borders/30 flex flex-col min-h-[560px]"}>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-primary">
                {selectedContainer ? `${selectedContainer.service} logs` : "Container logs"}
              </h2>
              {selectedContainer && (
                <p className="text-xs text-muted font-mono truncate mt-0.5">{selectedContainer.status}</p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-muted">
              <span>Tail</span>
              <select
                value={String(tail)}
                onChange={(e) => {
                  const value = e.target.value;
                  setTail(value === "all" ? "all" : Number(value));
                }}
                disabled={!selectedId || !available}
                className="rounded-lg border border-borders bg-background px-2 py-1.5 text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {TAIL_OPTIONS.map((option) => (
                  <option key={String(option.value)} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-muted">
              <span>Level</span>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as LogLevelFilter)}
                disabled={!selectedId || !available}
                className="rounded-lg border border-borders bg-background px-2 py-1.5 text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {LEVEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                disabled={!selectedId || !available}
                className="rounded border-borders"
              />
              Auto-refresh (5s)
            </label>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={!selectedId || !available || loadingLogs}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-background border border-borders text-primary hover:bg-foreground/80 disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${loadingLogs ? "animate-spin" : ""}`} />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              disabled={!selectedId || !available}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-background border border-borders text-primary hover:bg-foreground/80 disabled:opacity-50"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              {isFullscreen ? "Exit" : "Fullscreen"}
            </button>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter log lines…"
              disabled={!selectedId || !available}
              className="w-full rounded-lg border border-borders bg-background pl-9 pr-4 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            />
          </div>

          <div className="flex-1 relative min-h-[400px]">
            {loadingLogs && !logLines && (
              <div className="absolute inset-0 flex items-center justify-center text-muted">
                <Loader2 className="size-6 animate-spin" />
              </div>
            )}
            {!selectedId ? (
              <p className="text-sm text-muted py-8 text-center">Select a container to view logs.</p>
            ) : (
              <div
                ref={logPanelRef}
                className="absolute inset-0 overflow-auto text-xs font-mono bg-background border border-borders rounded-lg p-4"
              >
                <LogLineList lines={displayedLogLines} loading={loadingLogs} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
