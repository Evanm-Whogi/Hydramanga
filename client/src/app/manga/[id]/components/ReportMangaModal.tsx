"use client";

import { useState } from "react";
import { X, Flag, Loader2 } from "lucide-react";
import { sendMangaReport } from "@/services/contactService";
import { toast } from "react-toastify";
import { toastApiError } from "@/lib/rateLimit";

interface ReportMangaModalProps {
  mangaId: number;
  mangaTitle: string;
  onClose: () => void;
}

type ReportType = "missing_chapter" | "mismatched_title";

export default function ReportMangaModal({ mangaId, mangaTitle, onClose }: ReportMangaModalProps) {
  const [reportType, setReportType] = useState<ReportType>("missing_chapter");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await sendMangaReport({
        seriesId: mangaId,
        mangaTitle,
        reportType,
        details: details.trim() || undefined,
      });
      toast.success("Report submitted. Thank you for helping improve our catalog.");
      onClose();
    } catch (err) {
      toastApiError(err, "Failed to submit report");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-background border border-borders rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borders px-4 py-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Flag className="size-5 text-muted"/> Report Issue</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-md hover:bg-foreground text-muted hover:text-primary" aria-label="Close" >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <p className="text-sm text-muted">Help us improve this manga entry. Select the issue type and add any relevant details.</p>

          <div>
            <label className="text-sm font-medium text-muted block mb-2">Issue type</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setReportType("missing_chapter")} className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  reportType === "missing_chapter"
                    ? "bg-accent text-white"
                    : "bg-foreground text-muted hover:bg-foreground/80 hover:text-primary"
                }`}
              >
                Missing chapter
              </button>
              <button type="button" onClick={() => setReportType("mismatched_title")} className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  reportType === "mismatched_title"
                    ? "bg-accent text-white"
                    : "bg-foreground text-muted hover:bg-foreground/80 hover:text-primary"
                }`}
              >
                Mismatched title
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-muted block mb-1.5">{reportType === "missing_chapter" ? "Details (e.g. chapter number, volume)" : "Details (e.g. correct title, source)"}</label>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder={
                reportType === "missing_chapter"
                  ? "Which chapter is missing? Any additional info..."
                  : "What should the correct title be? Where did you see it?"
              }
              rows={3}
              maxLength={2000}
              className="w-full bg-foreground border border-borders text-primary placeholder:text-muted px-4 py-2.5 rounded-xl outline-none transition-all focus:border-borders focus:ring-1 focus:ring-borders resize-none"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-foreground text-muted hover:bg-foreground/80 hover:text-primary">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-md hover:bg-accent/80 disabled:opacity-50">
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Submit report
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
