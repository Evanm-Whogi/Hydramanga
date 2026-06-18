'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useInCarousel } from '@/components/homepage/carousel/CarouselContext';
import { resolveCoverImageUrl } from '@/lib/coverImageCache';
import { getCardCoverUrl } from '@/lib/coverUtils';

type CoverImageProps = {
    cover: unknown;
    alt: string;
    className?: string;
    /** First visible row — load immediately without lazy delay */
    priority?: boolean;
};

const PLACEHOLDER_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const NOT_FOUND = '/notFound.png';

export default function CoverImage({ cover, alt, className = '', priority = false }: CoverImageProps) {
    const inCarousel = useInCarousel();
    const coverUrl = getCardCoverUrl(cover);
    const [carouselSrc, setCarouselSrc] = useState<string | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        if (!inCarousel) {
            setCarouselSrc(null);
            return;
        }
        if (coverUrl === NOT_FOUND) {
            setCarouselSrc(NOT_FOUND);
            return;
        }
        let cancelled = false;
        void resolveCoverImageUrl(coverUrl).then((src) => {
            if (!cancelled) setCarouselSrc(src);
        });
        return () => { cancelled = true; };
    }, [inCarousel, coverUrl]);

    useEffect(() => {
        if (inCarousel) return;
        const img = imgRef.current;
        if (!img) return;
        img.classList.remove('opacity-100');
        img.classList.add('opacity-0');
        if (img.complete && img.naturalWidth > 0) {
            img.classList.remove('opacity-0');
            img.classList.add('opacity-100');
        }
    }, [coverUrl, inCarousel]);

    const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        if (inCarousel) return;
        e.currentTarget.classList.remove('opacity-0');
        e.currentTarget.classList.add('opacity-100');
    }, [inCarousel]);

    const src = inCarousel ? (carouselSrc ?? PLACEHOLDER_SRC) : coverUrl;

    return (
        <img
            ref={imgRef}
            src={src}
            alt={alt}
            width={350}
            height={525}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            draggable={false}
            onLoad={handleLoad}
            onError={(e) => {
                const img = e.currentTarget;
                if (!img.src.endsWith(NOT_FOUND)) img.src = NOT_FOUND;
                else handleLoad(e);
            }}
            className={`${className} ${inCarousel ? 'opacity-100' : 'opacity-0 transition-opacity duration-200'}`}
        />
    );
}
