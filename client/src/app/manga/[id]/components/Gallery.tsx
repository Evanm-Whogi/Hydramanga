import { useMemo, useState } from "react";

function normalizeGallery(gallery: unknown): any[] {
    if (Array.isArray(gallery)) return gallery;
    if (gallery && typeof gallery === "object" && Array.isArray((gallery as { gallery?: unknown }).gallery)) {
        return (gallery as { gallery: any[] }).gallery;
    }
    return [];
}

export default function Gallery({ gallery, mangaTitle }: { gallery: unknown, mangaTitle: string }) {
    const [selectedLanguage, setSelectedLanguage] = useState("all");
    const galleryItems = useMemo(() => normalizeGallery(gallery), [gallery]);
    const filteredGallery = useMemo(() => {
        if (selectedLanguage === "all") return galleryItems;
        return galleryItems.filter((item: any) => item.language === selectedLanguage);
    }, [galleryItems, selectedLanguage]);

    return (
        <>
        <div className="space-y-4 w-full">
            <div className="">
                <button className={`px-4 py-2 rounded-md mr-2 cursor-pointer ${selectedLanguage === "all" ? "bg-foreground text-white border border-borders shadow-md" : "bg-foreground text-muted"}`} onClick={() => setSelectedLanguage("all")}>All</button>
                <button className={`px-4 py-2 rounded-md mr-2 cursor-pointer ${selectedLanguage === "en" ? "bg-foreground text-white border border-borders shadow-md" : "bg-foreground text-muted"}`} onClick={() => setSelectedLanguage("en")}>EN</button>
                <button className={`px-4 py-2 rounded-md mr-2 cursor-pointer ${selectedLanguage === "ja" ? "bg-foreground text-white border border-borders shadow-md" : "bg-foreground text-muted"}`} onClick={() => setSelectedLanguage("ja")}>JP</button>
            </div>
            <h1 className="text-muted font-semibold">{filteredGallery.length} Covers for {mangaTitle}</h1>
  
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                {filteredGallery.length > 0 ? (
                    filteredGallery.map((item: any) => (
                        <a href={item.image.raw.url} key={item.id} target="_blank" rel="noopener noreferrer" className="group block border border-borders rounded-md overflow-hidden h-80 bg-gray-100">
                            <img src={item.image.thumbnail?.url || item.image.raw.url} alt={item.description || "Gallery photo"} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        </a>
                    ))
                ) : (
                    <div className="col-span-full py-10 text-center">
                        <p className="text-muted">No gallery images available</p>
                    </div>
                )}
            </div>
        </div>
        </>
    )
}
