"use client";
import { TrendingUp, PlayIcon, EyeIcon, ChevronLeft, ChevronRight } from "lucide-react";
import Pill from "@/components/Pill";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { useEffect, useMemo, useState } from "react";

export default function Hero({ mangaData }: any) {
    const topManga = useMemo( () => (Array.isArray(mangaData) ? mangaData.slice(0, 6) : []), [mangaData]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const autoplayOptions = {
        delay: 4000,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
    };

    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: "start",
        dragFree: false,
        containScroll: "trimSnaps",
        loop: true,
    }, [Autoplay(autoplayOptions)]);

    const selectedManga = topManga[selectedIndex] ?? topManga[0];

    useEffect(() => {
        if (!emblaApi) return;
        
        const onSelect = () => {
            setSelectedIndex(emblaApi.selectedScrollSnap());
        };

        onSelect();
        emblaApi.on("select", onSelect);
        emblaApi.on("reInit", onSelect);

        return () => {
            emblaApi.off("select", onSelect);
            emblaApi.off("reInit", onSelect);
        };
    }, [emblaApi]);

    return (
        <section id="hero" className="pt-25 relative overflow-hidden pb-15 xl:mb-0">
            <div className="absolute inset-0 -z-50 min-h-[55vh] overflow-hidden">
                <div className="absolute inset-0 bg-cover bg-center scale-100" style={{ backgroundImage: `url(${selectedManga?.cover?.raw.url || "/notFound.png"})`}}/>
                <div className="absolute inset-0 bg-linear-to-r from-background via-background/95 to-background/60" />
                <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-background/80" />
                <div className="absolute top-20 right-20 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-float-aggressive" />
                <div className="absolute bottom-20 left-20 w-64 h-64 bg-accent/20 rounded-full blur-3xl animate-float-aggressive"/>
            </div>
            <div className="container mx-auto text-primary pt-[6vh] min-h-[55vh] overflow-hidden">
                <div className="flex flex-col group/carousel relative">
                    {/* Carousel Left Navigation: only the circle is clickable */}
                    <div className="absolute left-0 top-0 bottom-0 z-10 w-12 flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-300 pointer-events-none">
                        <button type="button" onClick={() => emblaApi?.scrollPrev()}
                            className="pointer-events-auto p-2 rounded-full bg-foreground/90 text-white shadow-lg cursor-pointer hover:bg-accent ml-3">
                            <ChevronLeft size={24} />
                        </button>
                    </div>
                    {/* Carousel Content */}
                    <div className="overflow-hidden w-full min-w-0" ref={emblaRef}>
                        <div className="flex">
                            {topManga.map((manga: any, index: number) => (
                                <div key={manga.id || index} className="flex-[0_0_100%] min-w-0 overflow-hidden">
                                    <div className="flex flex-row items-center justify-between space-x-6 min-w-0 px-3 md:px-4">
                                        <div className="flex flex-col space-y-4 max-w-6xl w-full min-w-0">
                                            <div className="flex px-4 py-2 bg-accent/20 backdrop-blur-sm rounded-full items-center w-fit animate-glow border border-accent/40 animate-shimmer">
                                                <TrendingUp className="size-5 mr-2" />
                                                <span className="text-sm font-semibold">#{index +1} Trending This Week</span>
                                            </div>

                                            <h1 className="text-5xl md:text-6xl font-bold leading-tight">{manga.title}</h1>
                                            <div className="flex flex-wrap max-w-3/4 gap-3 text-sm">
                                                {(manga.genres || []).map((genre: string) => (
                                                    <Pill key={genre} text={genre} theme="accent" size="px-2.5 py-0.5" />
                                                ))}
                                            </div>
                                            <div className="text-lg text-muted max-w-4xl mt-3 line-clamp-4 wrap-break-words">{manga.description}</div>
                                            <div className="flex mt-4 space-x-6">
                                                <div className="flex items-center text-xl font-bold">
                                                    <div className="mr-1 bg-yellow-600/20 backdrop-blur-sm rounded-md p-2 border border-yellow-600/40 flex items-center justify-center">
                                                        <EyeIcon className="size-4 text-yellow-400" />
                                                    </div>
                                                    <div className="flex flex-col pl-3">
                                                        <span className="text-primary">{manga?.views || 0}</span>
                                                        <span className="text-muted text-sm">Views</span>
                                                    </div>
                                                </div>
                                                <div className="w-px h-12 bg-foreground"></div>
                                                <div className="flex flex-col pl-3 text-xl font-bold">
                                                    <span className="text-primary">{manga.totalChapters}</span>
                                                    <span className="text-muted text-sm">Chapters</span>
                                                </div>
                                                <div className="w-px h-12 bg-foreground"></div>
                                                <div className="flex flex-col pl-3 text-xl font-bold">
                                                    <span className="text-primary capitalize">{manga.status}</span>
                                                    <span className="text-muted text-sm">Status</span>
                                                </div>
                                            </div>
                                            <div className="flex space-x-3 mt-4">
                                                <Link href={`/manga/${manga.id}/`}className="inline-flex items-center bg-accent px-6 py-3 rounded-lg text-xl hover:bg-foreground transition"><PlayIcon className="size-5 mr-2" /> Read Now</Link>
                                            </div>
                                        </div>
                                        <div className="hidden md:flex items-center mx-auto">
                                            <img src={manga.cover?.raw.url || "/notFound.png"} alt="Hero Image" className="w-82 object-contain rounded-md"/>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Carousel Right Navigation: only the circle is clickable */}
                    <div className="absolute right-0 top-0 bottom-0 z-10 w-12 flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-300 pointer-events-none">
                        <button type="button" onClick={() => emblaApi?.scrollNext()}
                            className="pointer-events-auto p-2 rounded-full bg-foreground/90 text-white shadow-lg cursor-pointer hover:bg-accent mr-3">
                            <ChevronRight size={24} />
                        </button>
                    </div>
                </div>
                {/* Carousel Indicators */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
                    {topManga.map((_, index) => (
                        <button key={index} onClick={() => emblaApi?.scrollTo(index)}
                            className={`transition-all cursor-pointer duration-300 rounded-full ${selectedIndex === index  ? "w-16 h-2 bg-accent" : "w-2 h-2 bg-white/50 hover:bg-white/80"}`}
                            aria-label={`Go to slide ${index + 1}`}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}