"use client";

import { useEffect } from "react";
import { X, Shield } from "lucide-react";
import { BADGE_ICON_MAP } from '@/lib/badgeIcons';
import type { EarnedBadge } from '@/lib/badgeConfig';

export default function BadgeModal({ badge, onClose }: { badge: EarnedBadge; onClose: () => void }) {
  const Icon = BADGE_ICON_MAP[badge.icon] ?? Shield;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("overflow-hidden");
    return () => root.classList.remove("overflow-hidden");
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-lg border border-borders bg-foreground p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-primary transition-colors" aria-label="Close">
          <X className="size-5" />
        </button>
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-background border border-borders" style={{ color: badge.color }}>
            <Icon className="size-6" />
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <h3 className="text-lg font-semibold text-primary">{badge.name}</h3>
            <p className="mt-1 text-sm text-muted">{badge.description}</p>
            <p className="mt-3 text-sm text-primary">{badge.requirementText}</p>
            {badge.earnedAt && (
              <p className="mt-2 text-xs text-muted">Earned {new Date(badge.earnedAt).toLocaleDateString()}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
