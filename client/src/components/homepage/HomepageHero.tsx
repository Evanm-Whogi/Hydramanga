"use client";

import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { Info, PlayIcon } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { formatCompactNumber, formatTimeAgo } from "@/lib/utils";
import { getHeroBackgroundUrl } from "@/lib/coverUtils";
import { formatHeroStatus, heroReadHref } from "@/lib/homepageUtils";
import { mangaPath } from "@/lib/paths";
import type { HomepageSeriesCard } from "@/types/homepage";

function HeroMetaRow({ manga }: { manga: HomepageSeriesCard & { lastUpdatedAt?: string | null } }) {
  const parts = [
    formatHeroStatus(manga.status),
    manga.type ? manga.type.charAt(0).toUpperCase() + manga.type.slice(1) : null,
    manga.totalChapters != null ? `${manga.totalChapters} Chapters` : null,
    manga.views != null ? `${formatCompactNumber(manga.views)} Views` : null,
    manga.lastUpdatedAt ? formatTimeAgo(manga.lastUpdatedAt) : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
      {parts.map((part, index) => (
        <Fragment key={`${part}-${index}`}>
          {index > 0 && <span aria-hidden className="text-muted/60">·</span>}
          <span>{part}</span>
        </Fragment>
      ))}
    </div>
  );
}

export default function HomepageHero({ mangaData }: { mangaData: (HomepageSeriesCard & { description?: string | null; lastUpdatedAt?: string | null })[] }) {
  const topManga = useMemo(() => (Array.isArray(mangaData) ? mangaData.slice(0, 6) : []), [mangaData]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { align: "start", loop: true, containScroll: "trimSnaps" },
    [Autoplay({ delay: 4000, stopOnInteraction: false, stopOnMouseEnter: true })]
  );

  const selectedManga = topManga[selectedIndex] ?? topManga[0];
  const backgroundUrl = getHeroBackgroundUrl(selectedManga?.cover);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  if (topManga.length === 0) return null;

  return ( 
    <section id="homepage-hero" className="relative overflow-hidden pt-25 h-[50vh]">
      <div className="absolute inset-0 -z-50 overflow-hidden">
        <img src={backgroundUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-center" fetchPriority="high" decoding="async" />
        <div className="absolute inset-0 bg-linear-to-r from-background via-background/75 to-background/40" />
        <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-background/60" />
        <div className="absolute top-20 right-20 h-96 w-96 animate-float-aggressive rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute bottom-20 left-20 h-64 w-64 animate-float-aggressive rounded-full bg-accent/20 blur-3xl" />
      </div>

      <div className="container mx-auto flex h-full flex-col justify-end pb-6 md:pb-8">
        <div className="min-w-0 overflow-hidden" ref={emblaRef}>
          <div className="flex">
            {topManga.map((manga) => (
              <div key={manga.id} className="min-w-0 flex-[0_0_100%]">
                <div className="flex max-w-3xl flex-col gap-3 px-1 md:max-w-6xl md:gap-4">
                  <h1 className="text-3xl font-bold leading-tight text-primary sm:text-4xl md:text-5xl">{manga.title}</h1>
                  <HeroMetaRow manga={manga} />
                  <p className="line-clamp-2 text-sm text-muted md:text-base">{manga.description || "No description available."}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href={heroReadHref(manga)} className="inline-flex items-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold transition hover:bg-foreground md:text-base">
                      <PlayIcon className="mr-2 size-4" />
                      Read Now
                    </Link>
                    <Link href={mangaPath(manga.id)} className="inline-flex items-center rounded-lg border border-borders bg-foreground/80 px-5 py-2.5 text-sm font-semibold text-primary transition hover:bg-foreground md:text-base">
                      <Info className="mr-2 size-4" />
                      More Info
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 px-1">
          <div className="flex items-center gap-2">
            {topManga.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => emblaApi?.scrollTo(index)}
                aria-label={`Go to slide ${index + 1}`}
                className={`cursor-pointer rounded-full transition-all duration-300 ${selectedIndex === index ? "h-2 w-10 bg-accent" : "size-2 bg-white/50 hover:bg-white/80"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
