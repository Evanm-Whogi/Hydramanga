"use client";

import Link from "next/link";
import { EyeOff, Eye, Home, Compass } from "lucide-react";
import { useNsfw } from "@/providers/NsfwProvider";

/**
 * Interstitial shown when a series exists but the viewer's NSFW preference hides it.
 * Enabling NSFW via the button updates the preference and refreshes so the page can load.
 */
export default function NsfwBlockedContent() {
  const { hideNsfw, toggle, pending } = useNsfw();

  const handleEnable = () => {
    if (hideNsfw) {
      toggle();
      return;
    }
    // Preference already allows NSFW (e.g. race after toggle) — hard reload to re-fetch.
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-primary">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <EyeOff className="size-32 text-accent animate-pulse" />
              <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full" />
            </div>
          </div>

          <h1 className="text-6xl font-bold mb-3">18+</h1>
          <h2 className="text-3xl font-bold mb-4">NSFW Title Hidden</h2>
          <p className="text-lg text-muted mb-8">
            This series is marked as NSFW. Turn on NSFW content to view it, you can change this anytime from the navbar or your settings.
          </p>

          <div className="bg-foreground rounded-lg p-6 mb-8 text-left shadow-lg">
            <h3 className="text-lg font-semibold mb-3">What you can do:</h3>
            <ul className="text-muted space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-accent">•</span>
                <span>Enable NSFW below to view this title right away</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent">•</span>
                <span>Use the eye icon in the navbar to toggle 18+ content later</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent">•</span>
                <span>Browse safe-for-work titles on Discover instead</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-4 justify-center">
            <button
              type="button"
              onClick={handleEnable}
              disabled={pending}
              className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors font-semibold disabled:opacity-60"
            >
              <Eye className="size-5" />
              {pending ? "Updating…" : "Enable NSFW & View"}
            </button>
            <Link
              href="/discover"
              className="flex items-center gap-2 px-6 py-3 bg-foreground text-primary rounded-lg hover:bg-foreground/70 transition-colors font-semibold"
            >
              <Compass className="size-5" />
              Browse Manga
            </Link>
            <Link
              href="/"
              className="flex items-center gap-2 px-6 py-3 bg-foreground text-primary rounded-lg hover:bg-foreground/70 transition-colors font-semibold"
            >
              <Home className="size-5" />
              Go Home
            </Link>
          </div>

          <p className="text-sm text-muted mt-8">Error Code: NSFW_HIDDEN</p>
        </div>
      </div>
    </div>
  );
}
