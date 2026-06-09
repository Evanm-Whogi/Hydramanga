import type { ReactNode } from "react";
import type { ProfileVisibility } from "@/types/profile";
import { DEFAULT_PROFILE_VISIBILITY } from "@/types/profile";

export type ProfileTabId = "overview" | "lists" | "saved-lists" | "bookmarks" | "comments" | "wall" | "recent-reads" | "settings" | "activity";

type ProfileTabDef = {
  id: ProfileTabId;
  ownerLabel: string;
  publicLabel: string;
  ownerOnly?: boolean;
  visibilityKey?: keyof ProfileVisibility;
};

export const PROFILE_TAB_DEFS: ProfileTabDef[] = [
  { id: "overview", ownerLabel: "Overview", publicLabel: "Overview" },
  { id: "lists", ownerLabel: "My Lists", publicLabel: "Lists", visibilityKey: "lists" },
  { id: "saved-lists", ownerLabel: "Saved Lists", publicLabel: "Saved Lists", ownerOnly: true },
  { id: "bookmarks", ownerLabel: "Bookmarks", publicLabel: "Bookmarks", visibilityKey: "bookmarks" },
  { id: "comments", ownerLabel: "Comments", publicLabel: "Comments", visibilityKey: "comments" },
  { id: "wall", ownerLabel: "Wall", publicLabel: "Wall", visibilityKey: "wall" },
  { id: "recent-reads", ownerLabel: "Recent Reads", publicLabel: "Recent Reads", visibilityKey: "recentReads" },
  { id: "settings", ownerLabel: "Settings", publicLabel: "Settings", ownerOnly: true },
  { id: "activity", ownerLabel: "Activity", publicLabel: "Activity", ownerOnly: true },
];

export { DEFAULT_PROFILE_VISIBILITY };

export function normalizeProfileTab(tab: string | null): ProfileTabId {
  if (tab === "my-lists") return "lists";
  if (tab && PROFILE_TAB_DEFS.some((def) => def.id === tab)) return tab as ProfileTabId;
  return "overview";
}

export function buildProfileTabs(isOwner: boolean, visibility: ProfileVisibility, icons: Partial<Record<ProfileTabId, ReactNode>>): { id: ProfileTabId; label: string; icon?: ReactNode }[] {
  return PROFILE_TAB_DEFS.filter((def) => {
    if (def.ownerOnly && !isOwner) return false;
    if (!isOwner && def.visibilityKey && !visibility[def.visibilityKey]) return false;
    return true;
  }).map((def) => ({
    id: def.id,
    label: isOwner ? def.ownerLabel : def.publicLabel,
    icon: icons[def.id],
  }));
}
