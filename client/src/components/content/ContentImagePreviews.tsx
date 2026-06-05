"use client";

import { extractImageUrls } from "@/lib/contentImages";

export default function ContentImagePreviews({ content }: { content: string }) {
  const urls = extractImageUrls(content);
  if (urls.length === 0) return null;

  return (
    <div className="pt-1">
      <p className="text-xs text-muted mb-1.5">Image preview</p>
      <div className="flex flex-wrap gap-1.5">
        {urls.map((url) => (
          <div key={url} className="rounded border border-borders bg-background overflow-hidden shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="block object-contain w-64 h-64"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
