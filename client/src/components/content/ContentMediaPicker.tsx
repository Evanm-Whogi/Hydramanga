"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import { Sticker } from "lucide-react";
import { fetchStickers, type ContentSticker } from "@/services/stickerService";
import { getContentImageValidationError, insertTextAtSelection } from "@/lib/contentImages";

let stickersCache: ContentSticker[] | null = null;
let stickersPromise: Promise<ContentSticker[]> | null = null;

const PANEL_WIDTH = 520;
const PANEL_MAX_HEIGHT = 420;
const MOBILE_BREAKPOINT = 768;

function getViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: PANEL_WIDTH, height: PANEL_MAX_HEIGHT };
  return {
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  };
}

function computePanelLayout(anchor: DOMRect): { top: number; left: number; width: number; maxHeight: number } {
  const margin = 8;
  const { width: vw, height: vh } = getViewportSize();
  const isMobile = vw < MOBILE_BREAKPOINT;

  if (isMobile) {
    const width = vw - margin * 2;
    const maxHeight = Math.min(PANEL_MAX_HEIGHT, vh - margin * 2);
    return { top: vh - maxHeight - margin, left: margin, width, maxHeight };
  }

  const width = Math.min(PANEL_WIDTH, vw - margin * 2);
  let left = anchor.left;
  let top = anchor.bottom + margin;
  if (left + width > vw - margin) left = Math.max(margin, vw - width - margin);
  if (left < margin) left = margin;

  let maxHeight = Math.min(PANEL_MAX_HEIGHT, vh - top - margin);
  if (top + maxHeight > vh - margin) {
    top = Math.max(margin, anchor.top - maxHeight - margin);
    maxHeight = Math.min(PANEL_MAX_HEIGHT, vh - top - margin);
  }
  if (maxHeight < 160) {
    top = margin;
    maxHeight = Math.min(PANEL_MAX_HEIGHT, vh - margin * 2);
  }

  return { top, left, width, maxHeight };
}

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
  const [panelLayout, setPanelLayout] = useState({ top: 0, left: 0, width: PANEL_WIDTH, maxHeight: PANEL_MAX_HEIGHT });
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePanelLayout = () => {
    if (!buttonRef.current) return;
    setPanelLayout(computePanelLayout(buttonRef.current.getBoundingClientRect()));
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
    updatePanelLayout();
    const onReposition = () => updatePanelLayout();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    window.visualViewport?.addEventListener("resize", onReposition);
    window.visualViewport?.addEventListener("scroll", onReposition);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      window.visualViewport?.removeEventListener("resize", onReposition);
      window.visualViewport?.removeEventListener("scroll", onReposition);
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
    const imageError = getContentImageValidationError(next);
    if (imageError) {
      toast.warning(imageError);
      setStickersOpen(false);
      return;
    }
    onChange(next);
    setSelection(cursor, cursor);
    setStickersOpen(false);
  };

  const toggleOpen = () => {
    setStickersOpen((open) => {
      if (!open) updatePanelLayout();
      return !open;
    });
  };

  const panel =
    stickersOpen && mounted
      ? createPortal(
          <div
            ref={panelRef}
            style={{
              top: panelLayout.top,
              left: panelLayout.left,
              width: panelLayout.width,
              maxHeight: panelLayout.maxHeight,
            }}
            className="fixed z-200 overflow-y-auto overscroll-contain rounded-xl border border-borders bg-foreground shadow-2xl"
          >
            {loadingStickers ? (
              <p className="p-4 text-sm text-muted">Loading stickers…</p>
            ) : stickers.length === 0 ? (
              <p className="p-4 text-sm text-muted">No stickers available.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-2">
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
