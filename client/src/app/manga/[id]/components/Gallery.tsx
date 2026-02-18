import { useState, useEffect } from "react";

export default function Gallery({ gallery, mangaTitle }: { gallery: any, mangaTitle: string }) {
    const [selectedLanguage, setSelectedLanguage] = useState("all");
    const [filteredGallery, setFilteredGallery] = useState(gallery);

    useEffect(() => {
        const filteredGallery = selectedLanguage === "all" ? gallery : gallery.filter((item: any) => item.language === selectedLanguage);
        setFilteredGallery(filteredGallery);
    }, [selectedLanguage]);

    console.log("Gallery items:", gallery);
    console.log("Selected language:", selectedLanguage);
    console.log("Filtered gallery items:", filteredGallery);
    return (
        <>
        <div className="space-y-4 w-full">
            <div className="">
                <button className={`px-4 py-2 rounded-md mr-2 cursor-pointer ${selectedLanguage === "all" ? "bg-foreground text-white border border-borders" : "bg-foreground text-muted"}`} onClick={() => setSelectedLanguage("all")}>All</button>
                <button className={`px-4 py-2 rounded-md mr-2 cursor-pointer ${selectedLanguage === "en" ? "bg-foreground text-white border border-borders" : "bg-foreground text-muted"}`} onClick={() => setSelectedLanguage("en")}>EN</button>
                <button className={`px-4 py-2 rounded-md mr-2 cursor-pointer ${selectedLanguage === "ja" ? "bg-foreground text-white border border-borders" : "bg-foreground text-muted"}`} onClick={() => setSelectedLanguage("ja")}>JP</button>
            </div>
            <h1 className="text-muted font-semibold">{filteredGallery.length} Covers for {mangaTitle}</h1>
  
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                {filteredGallery.length === 0 && (<p className="text-muted col-span-full text-center">No gallery images available</p>)}
                {filteredGallery.map((item: any) => (
                    <a href={item.image.raw.url} key={item.id} className="border border-borders rounded-md overflow-hidden h-120">
                        <img src={item.image.raw.url} alt={`Gallery image ${item.id}`} className="w-full h-full object-cover" />
                    </a>
                ))}
            </div>
        </div>
        </>
    )
}