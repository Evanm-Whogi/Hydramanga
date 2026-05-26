'use client';

import { useEffect, useState } from 'react';
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

    useEffect(() => {
        setSrc(getCardCoverUrl(cover));
        setLoaded(false);
    }, [cover]);

    return (
        <img
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
