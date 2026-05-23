"use client";

import { useEffect, useRef } from "react";
import { MoreVertical } from "lucide-react";

export type ContentMenuItem = {
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
};

export type PostMenuItem = ContentMenuItem;

type ContentOverflowMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwner?: boolean;
  isAdmin?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  adminItems?: ContentMenuItem[];
  iconClassName?: string;
};

function MenuButton({
  label,
  onClick,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      className={`block w-full text-left px-3 py-2 text-sm hover:bg-foreground ${
        variant === "danger" ? "text-red-400" : ""
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Unified ⋮ menu: Edit/Delete for owners, admin actions below a divider. */
export function ContentOverflowMenu({
  open,
  onOpenChange,
  isOwner = false,
  isAdmin = false,
  onEdit,
  onDelete,
  adminItems = [],
  iconClassName = "size-5",
}: ContentOverflowMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const showOwner = isOwner && (onEdit || onDelete);
  const showAdmin = isAdmin && adminItems.length > 0;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, onOpenChange]);

  if (!showOwner && !showAdmin) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="text-muted hover:text-primary p-1 rounded-md transition-colors"
        aria-label="Post options"
        aria-expanded={open}
      >
        <MoreVertical className={iconClassName} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 bg-background border border-borders rounded-lg shadow-lg z-20 py-1 min-w-[140px]">
          {showOwner && onEdit && (
            <MenuButton label="Edit" onClick={() => { onOpenChange(false); onEdit(); }} />
          )}
          {showOwner && onDelete && (
            <MenuButton label="Delete" variant="danger" onClick={() => { onOpenChange(false); onDelete(); }} />
          )}
          {showOwner && showAdmin && <hr className="my-1 border-borders" />}
          {showAdmin &&
            adminItems.map((item) => (
              <MenuButton
                key={item.label}
                label={item.label}
                variant={item.variant}
                onClick={() => {
                  onOpenChange(false);
                  item.onClick();
                }}
              />
            ))}
        </div>
      )}
    </div>
  );
}

export default ContentOverflowMenu;
