"use client";
import React, { useMemo } from 'react';

const baseImages = [
    { src: "https://images.mangabaka.dev/b/f/a/7/b/c/0/9/ce05/435e/a8a7/ff59de10239b", alt: "Anime 1" },
    { src: "https://images.mangabaka.dev/c/b/d/5/5/f/e/8/71bc/4726/a56f/67a9129275d9", alt: "Anime 2" },
    { src: "https://images.mangabaka.dev/0/a/6/0/9/d/e/3/029b/44a5/ab19/0383513fa8d9", alt: "Anime 3" },
    { src: "https://images.mangabaka.dev/f/1/1/4/5/c/0/e/715a/4b72/aa5d/6e676bbd4bdf", alt: "Anime 4" },
    { src: "https://images.mangabaka.dev/4/d/5/6/b/0/b/c/7ab5/4b6f/bbc2/8fa6130e69d2", alt: "Anime 5" },
    { src: "https://images.mangabaka.dev/d/f/0/b/3/8/1/9/80b1/4a30/894e/b6e7502b08a6", alt: "Anime 6" },
    { src: "https://images.mangabaka.dev/0/5/7/3/d/7/9/5/631d/4662/80bb/9c4289071f26", alt: "Anime 7" },
    { src: "https://images.mangabaka.dev/9/e/0/6/1/c/4/4/918c/45b7/853a/75da9b658a25", alt: "Anime 8" },
    { src: "https://images.mangabaka.dev/d/9/6/f/4/1/6/7/e04c/4ddf/9434/6f1d9db77cc2.jpg", alt: "Anime 9" },
    { src: "https://images.mangabaka.dev/1/f/4/1/3/d/0/2/ff9e/4ebd/81bf/9d95e0b8a44e", alt: "Anime 10" },
    { src: "https://images.mangabaka.dev/0/2/6/8/e/6/4/a/6622/4000/81a1/72c1ab04e076", alt: "Anime 11" },
    { src: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx86218-sIl9tnqHZQyh.jpg", alt: "Anime 12" },
    { src: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx146983-pLf4apCkFwKL.jpg", alt: "Anime 13" },
    { src: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/nx98842-Ji0v423UZ4er.jpg", alt: "Anime 14" },
    { src: "https://images.mangabaka.dev/3/1/d/2/a/d/b/d/2466/4d52/8a34/a2a3be218258", alt: "Anime 15" },
    { src: "https://images.mangabaka.dev/8/2/a/7/c/c/1/d/7893/4255/8800/b8946f745f2b", alt: "Anime 16" },
];

export default function MasonryGrid() {
    const colStaggerOffset = 123;

    const staticRows = useMemo(() => {
        const imagesPerRow = 15;
        const numRows = 20;
        const totalRows = [];
        
        for (let r = 0; r < numRows; r++) {
            const row = [];
            for (let c = 0; c < imagesPerRow; c++) {
                // Use a fixed pattern so it's always the same
                const patternIndex = (r * 7 + c * 13) % baseImages.length;
                row.push(baseImages[patternIndex]);
            }
            totalRows.push(row);
        }
        return totalRows;
    }, []);

    return (
        <div className="absolute top-0 left-0 h-full overflow-hidden z-50 bg-black" style={{ width: "60%", clipPath: "polygon(0 0, 85% 0, 45% 100%, 0 100%)" }}>
            <div className="absolute inset-0" style={{ maskImage: "linear-gradient(to right, black 85%, transparent 100%)", WebkitMaskImage: "linear-gradient(to right, black 85%, transparent 100%)" }}>
                <div className="absolute" style={{ top: "-110%", left: "-45%", width: "250%", height: "320%", transform: "rotate(22deg)", transformOrigin: "center" }}>
                    <div className="flex flex-col gap-4 h-full justify-center">
                        {staticRows.map((row, rowIdx) => (
                            <div key={`row-${rowIdx}`} className="flex gap-4 whitespace-nowrap">
                                {row.map((img, colIdx) => (
                                    <div key={`img-${rowIdx}-${colIdx}`} className="relative overflow-hidden rounded-md group shrink-0" style={{ width: "160px", height: "230px", transform: `translateY(${colIdx * colStaggerOffset}px)` }}>
                                        <img src={img.src} alt={img.alt} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 brightness-80 group-hover:brightness-100" />
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}