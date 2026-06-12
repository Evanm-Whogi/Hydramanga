"use client";

import { useState } from "react";
import BadgeIcon from "./BadgeIcon";
import BadgeModal from "./BadgeModal";
import type { EarnedBadge } from "@/lib/badgeConfig";

export default function BadgeList({ badges, iconSize = 14, maxVisible = 5 }: { badges?: EarnedBadge[]; iconSize?: number; maxVisible?: number }) {
  const [selected, setSelected] = useState<EarnedBadge | null>(null);
  const [expanded, setExpanded] = useState(false);
  if (!badges?.length) return null;

  const hiddenCount = badges.length - maxVisible;
  const showOverflow = !expanded && hiddenCount > 0;
  const visibleBadges = showOverflow ? badges.slice(0, maxVisible) : badges;

  return (
    <>
      <span className="inline-flex items-center gap-1">
        {visibleBadges.map((badge) => (
          <BadgeIcon
            key={badge.id}
            badge={badge}
            size={iconSize}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelected(badge);
            }}
          />
        ))}
        {showOverflow && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded(true);
            }}
            className="inline-flex shrink-0 items-center rounded-md bg-background px-1.5 py-0.5 text-xs font-medium text-muted hover:text-primary transition-colors"
            title={`Show ${hiddenCount} more badge${hiddenCount === 1 ? "" : "s"}`}
          >
            +{hiddenCount}
          </button>
        )}
      </span>
      {selected && <BadgeModal badge={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
