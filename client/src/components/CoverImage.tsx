'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getCardCoverUrl } from '@/lib/coverUtils';

type CoverImageProps = {
    cover: unknown;
    alt: string;
    className?: string;
    /** First visible row — load immediately without lazy delay */
    priority?: boolean;
};

export default function CoverImage({ cover, alt, className = '', priority = false }: CoverImageProps) {
    const [loaded, setLoaded] = useState(false);
    const [src, setSrc] = useState(() => getCardCoverUrl(cover));
    const imgRef = useRef<HTMLImageElement>(null);

    const syncLoadedFromImage = useCallback((img: HTMLImageElement | null) => {
        // Cached images can finish before onLoad is attached (e.g. disk cache on refresh).
        if (img?.complete && img.naturalWidth > 0) {
            setLoaded(true);
        }
    }, []);

    useEffect(() => {
        setSrc(getCardCoverUrl(cover));
        setLoaded(false);
    }, [cover]);

    useEffect(() => {
        syncLoadedFromImage(imgRef.current);
    }, [src, syncLoadedFromImage]);

    const handleRef = useCallback(
        (img: HTMLImageElement | null) => {
            imgRef.current = img;
            syncLoadedFromImage(img);
        },
        [syncLoadedFromImage],
    );

    return (
        <img
            ref={handleRef}
            src={src}
            alt={alt}
            width={350}
            height={525}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => {
                if (src !== '/notFound.png') setSrc('/notFound.png');
                else setLoaded(true);
            }}
            className={`${className} transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
    );
}
