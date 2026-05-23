import type { ContentMenuItem } from "@/components/social/ContentOverflowMenu";

export function isAdminUser(role?: string | null): boolean {
  return role?.toLowerCase() === "admin";
}

/** Board post admin actions (Delete omitted when moderating own post — use owner Delete). */
export function boardPostAdminItems(
  post: { isPinned?: boolean; isLocked?: boolean },
  handlers: {
    onPin: () => void;
    onLock: () => void;
    onDelete?: () => void;
  }
): ContentMenuItem[] {
  const items: ContentMenuItem[] = [
    { label: post.isPinned ? "Unpin" : "Pin", onClick: handlers.onPin },
    { label: post.isLocked ? "Unlock" : "Lock", onClick: handlers.onLock },
  ];
  if (handlers.onDelete) {
    items.push({ label: "Delete", onClick: handlers.onDelete, variant: "danger" });
  }
  return items;
}
