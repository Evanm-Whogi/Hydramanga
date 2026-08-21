"use client";

import { getBannerBackgroundUrl } from "@/lib/coverUtils";

type SeriesBannerBackgroundProps = {
  cover: unknown;
  className?: string;
  imageClassName?: string;
  /** Hero-style gradient overlays over the banner (matches homepage hero). */
  variant?: "hero" | "plain";
  fetchPriority?: "high" | "low" | "auto";
};

export default function SeriesBannerBackground({ cover, className = "", imageClassName = "", variant = "plain", fetchPriority = "auto" }: SeriesBannerBackgroundProps) {
  const bannerUrl = getBannerBackgroundUrl(cover);

  if (bannerUrl) {
    return (
      <div className={`overflow-hidden ${className}`}>
        <img
          src={bannerUrl}
          alt=""
          aria-hidden
          fetchPriority={fetchPriority}
          decoding="async"
          className={`h-full w-full object-cover object-center brightness-[0.85] ${imageClassName}`}
        />
        {variant === "hero" ? (
          <>
            <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-background via-background/75 to-background/40" />
            <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-background via-transparent to-background/60" />
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`series-banner-fallback ${className}`} aria-hidden>
      <div className="absolute inset-0 bg-linear-to-br from-accent/25 via-background to-foreground/40" />
      <div className="absolute inset-0 bg-linear-to-t from-background/90 via-background/20 to-background/70" />
      <div className="absolute top-1/4 right-1/4 h-48 w-48 rounded-full bg-accent/15 blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 h-36 w-36 rounded-full bg-accent/10 blur-3xl" />
    </div>
  );
}
