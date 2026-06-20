"use client";

import { useRef, useState } from "react";
import { Upload, RefreshCw, FileJson, FileText, FileCode2 } from "lucide-react";
import { toast } from "react-toastify";
import {
  exportMyData,
  exportMyDataCsv,
  exportMyDataXml,
  importMyData,
  importExternalEntries,
  syncTracker,
  type ImportMode,
  type SyncSummary,
} from "@/services/profileService";
import { detectImport } from "@/lib/trackerImport";
import { toastApiError } from "@/lib/rateLimit";

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function summaryMessage(s: SyncSummary): string {
  return `Synced ${s.matched} of ${s.total}` + (s.unmatched > 0 ? ` (${s.unmatched} not in our library)` : "");
}

export default function DataExportSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [anilistUser, setAnilistUser] = useState("");
  const [malUser, setMalUser] = useState("");
  const [syncing, setSyncing] = useState<"anilist" | "myanimelist" | null>(null);

  const dateStamp = () => new Date().toISOString().slice(0, 10);

  const exportOptions = [
    {
      key: "json",
      icon: FileJson,
      label: "JSON",
      sub: "Full backup",
      run: async () => {
        const data = await exportMyData();
        downloadFile(JSON.stringify(data, null, 2), `mang-export-${dateStamp()}.json`, "application/json");
      },
    },
    {
      key: "csv",
      icon: FileText,
      label: "CSV",
      sub: "Spreadsheet",
      run: async () => downloadFile(await exportMyDataCsv(), `mang-export-${dateStamp()}.csv`, "text/csv"),
    },
    {
      key: "xml",
      icon: FileCode2,
      label: "XML",
      sub: "MyAnimeList",
      run: async () => downloadFile(await exportMyDataXml(), `mang-export-${dateStamp()}.xml`, "application/xml"),
    },
  ] as const;

  const handleExport = async (run: () => Promise<void>) => {
    try {
      await run();
      toast.success("Export downloaded");
    } catch (error) {
      toastApiError(error, "Export failed");
    }
  };

  const confirmReplace = () =>
    mode !== "replace" || window.confirm("Replace will clear your existing data before importing. Continue?");

  const handleImportFile = async (file: File) => {
    if (!confirmReplace()) return;
    setImporting(true);
    try {
      const parsed = await detectImport(file);
      if (parsed.kind === "mal-xml") {
        toast.success(summaryMessage(await importExternalEntries(parsed.provider, parsed.entries, mode)));
      } else {
        await importMyData(parsed.payload, mode);
        toast.success("Data imported successfully");
      }
    } catch (error) {
      toastApiError(error, "Import failed — check the file format");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSync = async (provider: "anilist" | "myanimelist", username: string) => {
    if (!username.trim()) {
      toast.error("Enter a username first");
      return;
    }
    if (!confirmReplace()) return;
    setSyncing(provider);
    try {
      toast.success(summaryMessage(await syncTracker(provider, username.trim(), mode)));
    } catch (error) {
      toastApiError(error, "Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  const inputClass =
    "flex-1 min-w-0 bg-background rounded-lg px-3 py-2 text-sm border border-borders outline-none focus:border-accent transition-colors";
  const syncButtonClass =
    "inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-background border border-borders hover:border-accent hover:text-accent transition-colors disabled:opacity-50 whitespace-nowrap";

  return (
    <div className="flex flex-col p-5 bg-foreground w-full md:w-1/2 rounded-md shadow-md gap-6">
      <div>
        <h1 className="text-xl font-bold">Data export &amp; import</h1>
        <p className="text-sm text-muted">
          Back up your library or pull it in from AniList &amp; MyAnimeList.
        </p>
      </div>

      {/* Export */}
      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">Export</h2>
        <div className="grid grid-cols-3 gap-2">
          {exportOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => handleExport(opt.run)}
              className="group flex flex-col items-center gap-1.5 bg-background rounded-lg p-3 border border-transparent hover:border-accent/50 hover:bg-accent/5 transition-colors"
            >
              <opt.icon className="size-5 text-muted group-hover:text-accent transition-colors" />
              <span className="text-sm font-semibold leading-none">{opt.label}</span>
              <span className="text-[11px] text-muted leading-none">{opt.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Import */}
      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">Import</h2>

        {/* Merge / Replace */}
        <div>
          <div className="grid grid-cols-2 gap-1 bg-background rounded-lg p-1">
            {(["merge", "replace"] as ImportMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                  mode === m ? "bg-accent text-white shadow" : "text-muted hover:text-primary"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted mt-1.5">
            {mode === "replace"
              ? "Clears your existing data before importing."
              : "Keeps your existing data and updates matches."}
          </p>
        </div>

        {/* File drop zone */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleImportFile(f);
          }}
          className={`flex flex-col items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed py-6 transition-colors disabled:opacity-50 ${
            dragging ? "border-accent bg-accent/5" : "border-borders hover:border-accent/60 hover:bg-accent/5"
          }`}
        >
          <Upload className={`size-5 ${importing ? "animate-pulse" : "text-muted"}`} />
          <span className="text-sm font-medium">
            {importing ? "Importing…" : "Drop a file or click to import"}
          </span>
          <span className="text-xs text-muted">JSON · CSV · XML</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json,text/csv,.csv,application/xml,text/xml,.xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f);
          }}
        />

        {/* Tracker sync */}
        <div className="flex flex-col gap-2 pt-1">
          <p className="text-xs text-muted">Or sync a public library by username:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={anilistUser}
              onChange={(e) => setAnilistUser(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSync("anilist", anilistUser)}
              placeholder="AniList username"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => handleSync("anilist", anilistUser)}
              disabled={syncing !== null}
              className={syncButtonClass}
            >
              <RefreshCw className={`size-4 ${syncing === "anilist" ? "animate-spin" : ""}`} />
              AniList
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={malUser}
              onChange={(e) => setMalUser(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSync("myanimelist", malUser)}
              placeholder="MyAnimeList username"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => handleSync("myanimelist", malUser)}
              disabled={syncing !== null}
              className={syncButtonClass}
            >
              <RefreshCw className={`size-4 ${syncing === "myanimelist" ? "animate-spin" : ""}`} />
              MAL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
