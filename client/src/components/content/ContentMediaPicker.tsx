"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sticker } from "lucide-react";
import { fetchStickers, type ContentSticker } from "@/services/stickerService";
import { insertTextAtSelection } from "@/lib/contentImages";

let stickersCache: ContentSticker[] | null = null;
let stickersPromise: Promise<ContentSticker[]> | null = null;

const PANEL_WIDTH = 520;
const PANEL_MAX_HEIGHT = 420;

function loadStickers(): Promise<ContentSticker[]> {
  if (stickersCache) return Promise.resolve(stickersCache);
  if (!stickersPromise) {
    stickersPromise = fetchStickers()
      .then((list) => {
        stickersCache = list;
        return list;
      })
      .catch(() => []);
  }
  return stickersPromise;
}

export function invalidateStickersCache() {
  stickersCache = null;
  stickersPromise = null;
}

function computePanelPosition(anchor: DOMRect): { top: number; left: number } {
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = anchor.left;
  let top = anchor.bottom + margin;
  if (left + PANEL_WIDTH > vw - margin) left = Math.max(margin, vw - PANEL_WIDTH - margin);
  if (top + PANEL_MAX_HEIGHT > vh - margin) top = Math.max(margin, anchor.top - PANEL_MAX_HEIGHT - margin);
  return { top, left };
}

export default function ContentMediaPicker({
  value,
  onChange,
  getSelection,
  setSelection,
}: {
  value: string;
  onChange: (value: string) => void;
  getSelection: () => { start: number; end: number };
  setSelection: (start: number, end: number) => void;
}) {
  const [stickersOpen, setStickersOpen] = useState(false);
  const [stickers, setStickers] = useState<ContentSticker[]>(stickersCache ?? []);
  const [loadingStickers, setLoadingStickers] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePanelPosition = () => {
    if (!buttonRef.current) return;
    setPanelPos(computePanelPosition(buttonRef.current.getBoundingClientRect()));
  };

  useEffect(() => {
    if (!stickersOpen) return;
    let cancelled = false;
    setLoadingStickers(true);
    loadStickers()
      .then((list) => {
        if (!cancelled) setStickers(list);
      })
      .finally(() => {
        if (!cancelled) setLoadingStickers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stickersOpen]);

  useEffect(() => {
    if (!stickersOpen) return;
    updatePanelPosition();
    const onReposition = () => updatePanelPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [stickersOpen]);

  useEffect(() => {
    if (!stickersOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setStickersOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [stickersOpen]);

  const handleStickerClick = (sticker: ContentSticker) => {
    const { start, end } = getSelection();
    const { value: next, cursor } = insertTextAtSelection(value, sticker.imageUrl, start, end);
    onChange(next);
    setSelection(cursor, cursor);
    setStickersOpen(false);
  };

  const toggleOpen = () => {
    setStickersOpen((open) => {
      if (!open) updatePanelPosition();
      return !open;
    });
  };

  const panel =
    stickersOpen && mounted
      ? createPortal(
          <div
            ref={panelRef}
            style={{ top: panelPos.top, left: panelPos.left, width: PANEL_WIDTH, maxHeight: PANEL_MAX_HEIGHT }}
            className="fixed z-200 overflow-y-auto rounded-xl border border-borders bg-foreground shadow-2xl"
          >
            {loadingStickers ? (
              <p className="p-4 text-sm text-muted">Loading stickers…</p>
            ) : stickers.length === 0 ? (
              <p className="p-4 text-sm text-muted">No stickers available.</p>
            ) : (
              <div className="grid gap-2 p-2" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                {stickers.map((sticker) => (
                  <button
                    key={sticker.id}
                    type="button"
                    title={sticker.label ?? "Sticker"}
                    onClick={() => handleStickerClick(sticker)}
                    className="flex h-24 min-w-0 items-center justify-center overflow-hidden rounded-lg border border-borders bg-background p-1 hover:border-accent hover:bg-background/80"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sticker.imageUrl}
                      alt={sticker.label ?? "Sticker"}
                      className="max-h-22 max-w-full object-contain"
                      loading="lazy"
                      draggable={false}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title="Stickers"
        onClick={toggleOpen}
        className="p-2 text-muted hover:text-primary hover:bg-background/50 border-r border-borders last:border-r-0"
      >
        <Sticker className="size-4" />
      </button>
      {panel}
    </>
  );
}
