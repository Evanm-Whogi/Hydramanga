"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "react-toastify";
import { exportMyData, importMyData } from "@/services/profileService";
import { toastApiError } from "@/lib/rateLimit";

const actionButtonClass =
  "bg-background hover:bg-background/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center justify-center gap-2 text-lg hover:cursor-pointer w-full";

export default function DataExportSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mang-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (error) {
      toastApiError(error, "Export failed");
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await importMyData(payload);
      toast.success("Data imported successfully");
    } catch (error) {
      toastApiError(error, "Import failed — check the file format");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col p-5 bg-foreground w-full md:w-1/2 rounded-md">
      <h1 className="text-xl font-bold">Data export & import</h1>
      <p className="text-sm text-muted">
        Export or restore your bookmarks, lists, saved lists, reading progress, recent reads, and view history as JSON.
      </p>
      <div className="flex flex-col gap-3 pt-5">
        <button type="button" onClick={handleExport} className={actionButtonClass}>
          <Download className="size-4" />
          Export my data
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className={`${actionButtonClass} disabled:opacity-50`}
        >
          <Upload className="size-4" />
          {importing ? "Importing…" : "Import from file"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f);
          }}
        />
      </div>
    </div>
  );
}
