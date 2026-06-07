"use client";

import { useState } from "react";
import BadgeIcon from "./BadgeIcon";
import BadgeModal from "./BadgeModal";
import type { EarnedBadge } from "@/lib/badgeConfig";

export default function BadgeList({ badges, iconSize = 14 }: { badges?: EarnedBadge[]; iconSize?: number }) {
  const [selected, setSelected] = useState<EarnedBadge | null>(null);
  if (!badges?.length) return null;

  return (
    <>
      <span className="inline-flex items-center gap-1">
        {badges.map((badge) => ( 
          <BadgeIcon key={badge.id} badge={badge} size={iconSize} onClick={() => setSelected(badge)} />
        ))}
      </span>
      {selected && <BadgeModal badge={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
