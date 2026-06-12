"use client";

import { Check, Shield } from "lucide-react";
import { BADGE_BY_ID, CHAPTER_MILESTONE_BADGES, CHAPTER_MILESTONE_BADGE_IDS, getChapterMilestoneIndexForReadCount, getChapterMilestoneTierProgress, getChapterMilestoneTierStatus, type EarnedBadge } from "@/lib/badgeConfig";
import { BADGE_ICON_MAP } from "@/lib/badgeIcons";
import { formatCompactNumber } from "@/lib/utils";

function tierIconClassName(status: ReturnType<typeof getChapterMilestoneTierStatus>): string {
  if (status === "completed") return "border-accent/50 bg-accent/10";
  if (status === "current") return "border-accent bg-background ring-2 ring-accent/25";
  return "border-borders bg-background/80 opacity-45";
}

export default function ChapterMilestoneProgressTree({ badge, chaptersRead, earnedBadgeId }: { badge: EarnedBadge; chaptersRead: number | null; earnedBadgeId: string | null }) {
  const resolvedEarnedBadgeId = earnedBadgeId ?? (badge.earnedAt ? badge.id : null);
  const earnedIndex = resolvedEarnedBadgeId ? CHAPTER_MILESTONE_BADGE_IDS.indexOf(resolvedEarnedBadgeId) : -1;
  const autoIndex = chaptersRead !== null ? getChapterMilestoneIndexForReadCount(chaptersRead) : -1;
  const isAdminAhead = earnedIndex > autoIndex;

  return (
    <div className="mt-5 border-t border-borders pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Hydra reading path</p>
      <ol className="mt-3 space-y-0">
        {CHAPTER_MILESTONE_BADGES.map((milestone, index) => {
          const definition = BADGE_BY_ID[milestone.id];
          const status = getChapterMilestoneTierStatus(index, chaptersRead, resolvedEarnedBadgeId);
          const TierIcon = BADGE_ICON_MAP[definition.icon] ?? Shield;
          const isLast = index === CHAPTER_MILESTONE_BADGES.length - 1;
          const isSelected = badge.id === milestone.id;
          const showAwardedOnly = status === "current" && isAdminAhead && index === earnedIndex;
          const progress = status === "current" && chaptersRead !== null && !showAwardedOnly
            ? getChapterMilestoneTierProgress(index, chaptersRead)
            : status === "current" && (showAwardedOnly || (chaptersRead !== null && chaptersRead >= milestone.threshold))
              ? 100
              : null;

          return (
            <li key={milestone.id} className="relative flex gap-3">
              {!isLast && (
                <span
                  className={`absolute left-[15px] top-8 h-[calc(100%-12px)] w-px ${status === "completed" ? "bg-accent/60" : "bg-borders"}`}
                  aria-hidden
                />
              )}
              <div className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors ${tierIconClassName(status)}`}>
                <TierIcon className="size-4" style={{ color: status === "upcoming" ? undefined : definition.color }} aria-hidden />
                {status === "completed" && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-accent text-white">
                    <Check className="size-2.5" strokeWidth={3} aria-hidden />
                  </span>
                )}
              </div>
              <div className={`min-w-0 flex-1 pb-4 ${isSelected ? "rounded-md border border-accent/40 bg-accent/5 px-3 py-2 -mx-1 -mt-1" : ""}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className={`text-sm font-medium ${status === "upcoming" ? "text-muted" : "text-primary"}`}>{definition.name}</p>
                  {status === "current" && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                      {showAwardedOnly ? "Awarded" : "Current"}
                    </span>
                  )}
                  {isSelected && status !== "current" && (
                    <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">Viewing</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted">{definition.requirementText}</p>
                {status === "current" && chaptersRead !== null && (
                  <div className="mt-2 space-y-1">
                    {showAwardedOnly ? (
                      <p className="text-[11px] text-muted">{formatCompactNumber(chaptersRead)} chapters read so far</p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-[11px] text-muted">
                          <span>
                            {formatCompactNumber(chaptersRead)} / {formatCompactNumber(milestone.threshold)} chapters
                          </span>
                          {progress !== null && progress < 100 && <span>{Math.round(progress)}%</span>}
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
                          <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${progress ?? 0}%` }} />
                        </div>
                      </>
                    )}
                  </div>
                )}
                {status === "current" && chaptersRead === null && (
                  <p className="mt-2 text-[11px] text-muted">Progress unavailable</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
