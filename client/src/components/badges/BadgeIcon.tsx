"use client";

import { Shield } from "lucide-react";
import type { EarnedBadge } from "@/lib/badgeConfig";
import { BADGE_ICON_MAP } from "@/lib/badgeIcons";

export default function BadgeIcon({ badge, size = 16, onClick }: { badge: Pick<EarnedBadge, "icon" | "color" | "name">; size?: number; onClick?: (e: React.MouseEvent) => void }) {
  const Icon = BADGE_ICON_MAP[badge.icon] ?? Shield;
  const Tag = onClick ? "button" : "span";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={badge.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
      style={{ color: badge.color }}
    >
      <Icon style={{ width: size, height: size }} aria-hidden />
    </Tag>
  );
}
