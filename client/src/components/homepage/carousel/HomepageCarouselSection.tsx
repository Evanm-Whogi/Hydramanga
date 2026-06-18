"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { InCarouselContext } from "@/components/homepage/carousel/CarouselContext";
import { homepageCarouselNavButtonClass } from "@/lib/homepageCarouselControls";

export default function HomepageCarouselSection({ title, children, headerTrailing, loading, scrollResetKey }: { title: string; children: ReactNode; headerTrailing?: ReactNode; loading?: boolean; scrollResetKey?: string | number }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", dragFree: true, containScroll: "trimSnaps", watchFocus: false });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const prevBtnRef = useRef<HTMLButtonElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);

  const setViewportRef = useCallback((node: HTMLDivElement | null) => {
    viewportRef.current = node;
    emblaRef(node);
  }, [emblaRef]);

  const updateNavButtons = useCallback(() => {
    if (!emblaApi) return;
    if (prevBtnRef.current) prevBtnRef.current.disabled = !emblaApi.canScrollPrev();
    if (nextBtnRef.current) nextBtnRef.current.disabled = !emblaApi.canScrollNext();
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    updateNavButtons();
    emblaApi.on("reInit", updateNavButtons);
    emblaApi.on("settle", updateNavButtons);
    const onPointerDown = () => viewportRef.current?.setAttribute("data-carousel-dragging", "true");
    const onPointerUp = () => viewportRef.current?.removeAttribute("data-carousel-dragging");
    emblaApi.on("pointerDown", onPointerDown);
    emblaApi.on("pointerUp", onPointerUp);
    return () => {
      emblaApi.off("reInit", updateNavButtons);
      emblaApi.off("settle", updateNavButtons);
      emblaApi.off("pointerDown", onPointerDown);
      emblaApi.off("pointerUp", onPointerUp);
    };
  }, [emblaApi, updateNavButtons]);

  useEffect(() => {
    if (emblaApi && scrollResetKey !== undefined) emblaApi.scrollTo(0);
  }, [scrollResetKey, emblaApi]);

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-3xl font-bold text-primary">{title}</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {headerTrailing}
          <button ref={prevBtnRef} type="button" aria-label="Scroll carousel left" onClick={() => emblaApi?.scrollPrev()} disabled className={homepageCarouselNavButtonClass}>
            <ChevronLeft size={20} />
          </button>
          <button ref={nextBtnRef} type="button" aria-label="Scroll carousel right" onClick={() => emblaApi?.scrollNext()} className={homepageCarouselNavButtonClass}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      <InCarouselContext.Provider value={true}>
        <div className="min-w-0 overflow-hidden contain-[layout_paint]" ref={setViewportRef}>
          <div className={`flex gap-4 ${loading ? "opacity-50" : ""}`}>{children}</div>
        </div>
      </InCarouselContext.Provider>
    </section>
  );
}
