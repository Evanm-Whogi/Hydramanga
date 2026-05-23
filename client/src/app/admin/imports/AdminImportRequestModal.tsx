"use client";

import { useEffect, useState } from "react";
import { X, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { toast } from "react-toastify";
import { updateAdminImportRequest, type AdminImportRequest, type AdminImportRequestUpdatePayload } from "@/services/adminImportRequestService";
import type { ImportRequestStatus } from "@/services/importRequestService";
import AdminMangaEditModal from "@/app/manga/[id]/components/AdminMangaEditModal";
import { fetchMangaForAdminEdit } from "@/services/adminMangaListService";
import { adminGetSource } from "@/services/adminMangaService";

const STATUS_OPTIONS: { value: ImportRequestStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
];

interface AdminImportRequestModalProps {
  request: AdminImportRequest;
  onClose: () => void;
  onSaved: (updated: AdminImportRequest) => void;
}

export default function AdminImportRequestModal({request, onClose, onSaved}: AdminImportRequestModalProps) {
  const [status, setStatus] = useState<ImportRequestStatus>(request.status);
  const [adminNotes, setAdminNotes] = useState(request.adminNotes ?? "");
  const [seriesIdInput, setSeriesIdInput] = useState(request.seriesId != null ? String(request.seriesId) : "");
  const [saving, setSaving] = useState(false);
  const [openingImport, setOpeningImport] = useState(false);
  const [importModal, setImportModal] = useState<{
    manga: Record<string, unknown>;
    chapters: Array<{ id: number; chapterNumber: string; title?: string | null }>;
    scraperId: string | null;
    scraperUrl: string | null;
    isScanActive: boolean;
  } | null>(null);

  useEffect(() => {
    setStatus(request.status);
    setAdminNotes(request.adminNotes ?? "");
    setSeriesIdInput(request.seriesId != null ? String(request.seriesId) : "");
  }, [request]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: AdminImportRequestUpdatePayload = {
        status,
        adminNotes: adminNotes.trim() || null,
      };
      const parsedSeries = seriesIdInput.trim() ? Number(seriesIdInput.trim()) : null;
      if (seriesIdInput.trim()) {
        if (!Number.isFinite(parsedSeries) || (parsedSeries ?? 0) <= 0) {
          toast.error("Series ID must be a positive number");
          return;
        }
        updates.seriesId = parsedSeries;
      } else if (request.seriesId != null) {
        updates.seriesId = null;
      }

      const updated = await updateAdminImportRequest(request.id, updates);
      toast.success("Request updated");
      onSaved(updated);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update request";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const openImportTools = async () => {
    const id = request.seriesId ?? (seriesIdInput.trim() ? Number(seriesIdInput.trim()) : NaN);
    if (!Number.isFinite(id) || id <= 0) {
      toast.error("Link a valid series ID first, then save");
      return;
    }
    setOpeningImport(true);
    try {
      const [{ manga, chapters }, source] = await Promise.all([
        fetchMangaForAdminEdit(id),
        adminGetSource(id).catch(() => ({
          scraperId: null as string | null,
          scraperUrl: null as string | null,
        })),
      ]);
      const progress = manga.importProgress as { status?: string } | undefined;
      const isScanActive =
        progress?.status === "scanning" || progress?.status === "downloading";
      setImportModal({
        manga,
        chapters,
        scraperId: source.scraperId ?? null,
        scraperUrl: source.scraperUrl ?? null,
        isScanActive,
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to load manga for import tools");
    } finally {
      setOpeningImport(false);
    }
  };

  const effectiveSeriesId = request.seriesId ?? (seriesIdInput.trim() ? Number(seriesIdInput.trim()) : null);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
        <div
          className="bg-background border border-borders rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-borders">
            <h2 className="text-lg font-bold text-primary">Import request #{request.id}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-muted hover:text-primary hover:bg-foreground"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="p-4 space-y-4 text-sm">
            <div>
              <p className="text-muted">Requested title</p>
              <p className="font-medium text-primary">{request.requestedTitle}</p>
            </div>
            {request.requestedUrl && (
              <div>
                <p className="text-muted">Source URL</p>
                <a
                  href={request.requestedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline break-all"
                >
                  {request.requestedUrl}
                </a>
              </div>
            )}
            {request.notes && (
              <div>
                <p className="text-muted">User notes</p>
                <p className="text-primary whitespace-pre-wrap">{request.notes}</p>
              </div>
            )}
            <div>
              <p className="text-muted">Requested by</p>
              <p className="text-primary">
                {request.userName} ({request.userEmail})
              </p>
            </div>
            <p className="text-xs text-muted">
              Submitted {new Date(request.createdAt).toLocaleString()}
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ImportRequestStatus)}
                className="w-full px-3 py-2 rounded-lg bg-foreground border border-borders text-primary"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted">Series ID (link to site manga)</label>
              <input
                type="text"
                inputMode="numeric"
                value={seriesIdInput}
                onChange={(e) => setSeriesIdInput(e.target.value)}
                placeholder="e.g. 42"
                className="w-full px-3 py-2 rounded-lg bg-foreground border border-borders text-primary"
              />
              {effectiveSeriesId && Number.isFinite(effectiveSeriesId) && (
                <Link
                  href={`/manga/${effectiveSeriesId}`}
                  className="inline-flex items-center gap-1 text-accent hover:underline text-xs"
                >
                  View manga page <ExternalLink className="size-3" />
                </Link>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted">Admin notes</label>
              <textarea
                rows={3}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-foreground border border-borders text-primary resize-y"
                placeholder="Internal notes for other admins"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 p-4 border-t border-borders">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={openImportTools}
              disabled={openingImport}
              className="px-4 py-2 rounded-lg bg-foreground border border-borders text-primary hover:bg-foreground/80 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {openingImport && <Loader2 className="size-4 animate-spin" />}
              Open import tools
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-muted hover:text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {importModal && effectiveSeriesId && (
        <AdminMangaEditModal
          mangaId={effectiveSeriesId}
          mangaTitle={(importModal.manga.title as string) ?? request.requestedTitle}
          manga={importModal.manga}
          secondaryTitles={importModal.manga.secondaryTitles as unknown}
          chapters={importModal.chapters}
          currentScraperId={importModal.scraperId}
          currentScraperUrl={importModal.scraperUrl}
          isScanActive={importModal.isScanActive}
          onClose={() => setImportModal(null)}
        />
      )}
    </>
  );
}
