"use client";

import { useState } from "react";
import BadgeIcon from "@/components/badges/BadgeIcon";
import BadgeModal from "@/components/badges/BadgeModal";
import { isChapterMilestoneBadge, type EarnedBadge } from "@/lib/badgeConfig";

export default function ProfileBadgesCard({ badges, userId, chaptersRead }: { badges?: EarnedBadge[]; userId?: string; chaptersRead?: number }) {
  const [selected, setSelected] = useState<EarnedBadge | null>(null);
  const earned = badges ?? [];
  const earnedChapterMilestoneId = earned.find((badge) => isChapterMilestoneBadge(badge.id))?.id ?? null;

  return (
    <div className="bg-foreground rounded-md p-5 w-full mt-5">
      <h3 className="text-lg font-semibold text-primary mb-3">Badges</h3>
      {earned.length === 0 ? (
        <p className="text-sm text-muted">No badges earned yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {earned.map((badge) => (
            <button
              key={badge.id}
              type="button"
              onClick={() => setSelected(badge)}
              className="flex items-center gap-2 rounded-lg border border-borders bg-background px-3 py-2 text-sm text-primary hover:border-accent transition-colors"
            >
              <BadgeIcon badge={badge} size={14} />
              <span className="text-sm">{badge.name}</span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <BadgeModal
          badge={selected}
          onClose={() => setSelected(null)}
          userId={userId}
          chaptersRead={chaptersRead}
          earnedChapterMilestoneId={earnedChapterMilestoneId}
        />
      )}
    </div>
  );
}
