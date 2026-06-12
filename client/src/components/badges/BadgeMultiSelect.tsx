"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import BadgeIcon from "@/components/badges/BadgeIcon";
import { BADGE_DEFINITIONS, BADGE_PILLAR_ORDER, type BadgeCategory } from "@/lib/badgeConfig";

const PILLAR_LABELS: Record<BadgeCategory, string> = {
  reading: "Reading",
  community: "Community",
  reviews: "Reviews",
  discovery: "Discovery",
  collection: "Collection",
  social: "Social",
  prestige: "Prestige",
  legacy: "Legacy",
  secrets: "Secrets",
  management: "Management",
};

export default function BadgeMultiSelect({ value, onChange, disabled }: { value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selected = new Set(value);
  const toggle = (id: string) => {
    if (selected.has(id)) onChange(value.filter((b) => b !== id));
    else onChange([...value, id]);
  };

  const dropdown = open && mounted ? (
    <div
      ref={dropdownRef}
      className="fixed z-200 max-h-72 overflow-y-auto rounded-xl border border-borders bg-foreground shadow-xl p-2"
      style={{ top: coords.top, left: coords.left, width: coords.width }}
    >
      {BADGE_PILLAR_ORDER.map((pillar) => {
        const badges = BADGE_DEFINITIONS.filter((b) => b.category === pillar);
        if (badges.length === 0) return null;
        return (
          <div key={pillar} className="mb-2 last:mb-0">
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">{PILLAR_LABELS[pillar]}</p>
            <ul className="space-y-0.5">
              {badges.map((badge) => {
                const isOn = selected.has(badge.id);
                return (
                  <li key={badge.id}>
                    <button
                      type="button"
                      onClick={() => toggle(badge.id)}
                      className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-background transition-colors ${isOn ? "bg-background/60" : ""}`}
                    >
                      <span className={`flex size-4 shrink-0 items-center justify-center rounded border ${isOn ? "border-accent bg-accent text-white" : "border-borders"}`}>
                        {isOn && <Check className="size-3" />}
                      </span>
                      <BadgeIcon badge={badge} size={16} />
                      <span className="text-primary truncate">{badge.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="relative w-full">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 bg-foreground border border-borders text-primary px-4 py-2.5 rounded-xl outline-none disabled:opacity-50 hover:cursor-pointer"
      >
        <span className="text-sm">{value.length === 0 ? "No badges selected" : `${value.length} badge${value.length === 1 ? "" : "s"} selected`}</span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
