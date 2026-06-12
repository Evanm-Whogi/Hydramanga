"use client";

import { useEffect, useState } from "react";
import { X, Shield } from "lucide-react";
import { BADGE_ICON_MAP } from '@/lib/badgeIcons';
import { isChapterMilestoneBadge, type EarnedBadge } from '@/lib/badgeConfig';
import { getProfileStats } from '@/services/profileService';
import ChapterMilestoneProgressTree from '@/components/badges/ChapterMilestoneProgressTree';

export default function BadgeModal({ badge, onClose, userId, chaptersRead: chaptersReadProp, earnedChapterMilestoneId }: { badge: EarnedBadge; onClose: () => void; userId?: string; chaptersRead?: number; earnedChapterMilestoneId?: string | null }) {
  const Icon = BADGE_ICON_MAP[badge.icon] ?? Shield;
  const showProgressTree = isChapterMilestoneBadge(badge.id);
  const [chaptersRead, setChaptersRead] = useState<number | null>(chaptersReadProp ?? null);
  const [loadingProgress, setLoadingProgress] = useState(showProgressTree && chaptersReadProp === undefined && Boolean(userId));

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("overflow-hidden");
    return () => root.classList.remove("overflow-hidden");
  }, []);

  useEffect(() => {
    if (chaptersReadProp !== undefined) {
      setChaptersRead(chaptersReadProp);
      setLoadingProgress(false);
      return;
    }
    if (!showProgressTree || !userId) {
      setLoadingProgress(false);
      return;
    }
    let cancelled = false;
    setLoadingProgress(true);
    getProfileStats(userId)
      .then(({ stats }) => {
        if (!cancelled) setChaptersRead(typeof stats.chaptersRead === "number" ? stats.chaptersRead : null);
      })
      .catch(() => {
        if (!cancelled) setChaptersRead(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingProgress(false);
      });
    return () => {
      cancelled = true;
    };
  }, [badge.id, chaptersReadProp, showProgressTree, userId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-borders bg-foreground p-6 shadow-xl"
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
            {!showProgressTree && <p className="mt-3 text-sm text-primary">{badge.requirementText}</p>}
            {badge.earnedAt && (
              <p className="mt-2 text-xs text-muted">Earned {new Date(badge.earnedAt).toLocaleDateString()}</p>
            )}
          </div>
        </div>
        {showProgressTree && (
          loadingProgress ? (
            <div className="mt-5 border-t border-borders pt-4">
              <div className="h-4 w-32 animate-pulse rounded bg-background" />
              <div className="mt-3 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-10 animate-pulse rounded bg-background" />
                ))}
              </div>
            </div>
          ) : (
            <ChapterMilestoneProgressTree badge={badge} chaptersRead={chaptersRead} earnedBadgeId={earnedChapterMilestoneId ?? badge.id} />
          )
        )}
      </div>
    </div>
  );
}
