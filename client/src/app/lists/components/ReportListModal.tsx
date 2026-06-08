"use client";

import { useState } from "react";
import { X, Flag, Loader2 } from "lucide-react";
import { reportList } from "@/services/curatedListService";
import { toast } from "react-toastify";
import { toastApiError } from "@/lib/rateLimit";

interface ReportListModalProps {
  listId: number;
  listTitle: string;
  onClose: () => void;
}

type ReportType = "spam" | "wrong_content" | "copyright" | "other";

export default function ReportListModal({ listId, listTitle, onClose }: ReportListModalProps) {
  const [reportType, setReportType] = useState<ReportType>("spam");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await reportList(listId, { listTitle, reportType, details: details.trim() || undefined });
      toast.success("Report submitted. Thank you for helping keep the community safe.");
      onClose();
    } catch (err) {
      toastApiError(err, "Failed to submit report");
    } finally {
      setIsSubmitting(false);
    }
  };

  const types: { value: ReportType; label: string }[] = [
    { value: "spam", label: "Spam" },
    { value: "wrong_content", label: "Wrong content" },
    { value: "copyright", label: "Copyright" },
    { value: "other", label: "Other" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-background border border-borders rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borders px-4 py-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Flag className="size-5 text-muted" /> Report List</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-md hover:bg-foreground text-muted" aria-label="Close"><X className="size-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <p className="text-sm text-muted">Report &quot;{listTitle}&quot; if it violates community guidelines.</p>
          <div className="grid grid-cols-2 gap-2">
            {types.map((t) => (
              <button key={t.value} type="button" onClick={() => setReportType(t.value)} className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${reportType === t.value ? "bg-accent text-white" : "bg-foreground text-muted hover:text-primary"}`}>{t.label}</button>
            ))}
          </div>
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Additional details (optional)" rows={3} maxLength={2000} className="w-full px-3 py-2 bg-foreground border border-borders rounded-lg text-primary resize-none" />
          <button type="submit" disabled={isSubmitting} className="w-full py-2.5 rounded-lg bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            {isSubmitting ? <><Loader2 className="size-4 animate-spin" /> Submitting...</> : "Submit Report"}
          </button>
        </form>
      </div>
    </div>
  );
}
