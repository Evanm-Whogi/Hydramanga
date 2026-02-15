import { useState, useEffect } from "react";
export default function Gallery({ gallery }: { gallery: any }) {

    return (
        <>
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">

                {gallery.length === 0 && (
                    <p className="text-muted col-span-full text-center">No gallery images available</p>
                )}
                {gallery.map((item: any) => (
                    <div key={item.id} className="border border-borders rounded-md overflow-hidden">
                        <img src={item.image.raw.url} alt={`Gallery image ${item.id}`} className="w-full h-auto object-cover" />
                    </div>
                ))}
            </div>
        </div>
        </>
    )
}