"use client";

import type { LucideIcon } from "lucide-react";
import { MessageCircle, MessagesSquare, Flag, Megaphone, BookOpen, Timer, Flame, EyeOff, CheckCircle2, Library, Shield, Skull } from "lucide-react";
import type { EarnedBadge } from "@/lib/badgeConfig";

const ICON_MAP: Record<string, LucideIcon> = {
  MessageCircle,
  MessagesSquare,
  Flag,
  Megaphone,
  BookOpen,
  Timer,
  Flame,
  EyeOff,
  CheckCircle2,
  Library,
  Shield,
  Skull,
};

export default function BadgeIcon({ badge, size = 16, onClick }: { badge: Pick<EarnedBadge, "icon" | "color" | "name">; size?: number; onClick?: () => void }) {
  const Icon = ICON_MAP[badge.icon] ?? Shield;
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
