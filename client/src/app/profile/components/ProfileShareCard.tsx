"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "react-toastify";

export default function ProfileShareCard({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_URL ?? "");
  const shareUrl = `${origin}/users/${encodeURIComponent(username)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Profile link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <div className="bg-foreground rounded-md p-5 w-full shadow-md">
      <h3 className="text-lg font-semibold text-primary mb-2">Share profile</h3>
      <p className="text-xs text-muted mb-3">Other members with this link can view your public profile.</p>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={shareUrl}
          className="flex-1 min-w-0 px-3 py-2 text-sm bg-background rounded-lg border border-borders text-muted cursor-default"
          aria-label="Profile share link"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
