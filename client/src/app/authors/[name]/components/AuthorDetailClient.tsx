"use client";

import { useState, memo } from "react";
import { BookOpen, PenTool, ShareIcon } from "lucide-react";
import { toast } from "react-toastify";
import SeriesGridCard from "@/components/SeriesGridCard";
import SeriesBookmarkModal from "@/components/SeriesBookmarkModal";
import HomepageMangaCarousel from "@/components/homepage/carousel/HomepageMangaCarousel";
import { mangaPath } from "@/lib/paths";
import { getCardCoverUrl } from "@/lib/coverUtils";
import type { AuthorDetail } from "@/services/authorService";

const AuthorBanner = memo(({ covers }: { covers: string[] }) => {
  const slots = [0, 1, 2, 3].map((i) => covers[i] || null);
  return (
    <div className="h-82 z-10 absolute lg:relative overflow-hidden bg-background">
      <div className="absolute inset-0 flex items-stretch justify-center px-2">
        {slots.map((url, i) => (
          <div key={i} className="relative flex-1 min-w-0 h-full overflow-visible">
            {url ? (
              <img src={url} alt="" className="absolute inset-0 w-full h-[115%] object-cover object-top brightness-[0.7] blur-[6px] scale-110" />
            ) : (
              <div className="absolute inset-0 bg-foreground flex items-center justify-center">
                <PenTool className="size-8 text-muted opacity-40" />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-background/20 to-background/60 pointer-events-none" />
    </div>
  );
});
AuthorBanner.displayName = "AuthorBanner";

export default function AuthorDetailClient({ detail }: { detail: AuthorDetail }) {
  const [saveTarget, setSaveTarget] = useState<{ seriesId: number; title: string } | null>(null);

  const previewCovers = detail.works
    .map((w) => getCardCoverUrl(w.cover))
    .filter((url) => url && url !== "/notFound.png")
    .slice(0, 4);
  const knownFor = detail.works.slice(0, 10);

  const handleShare = async () => {
    const url = `${window.location.origin}/authors/${encodeURIComponent(detail.name)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <>
      <AuthorBanner covers={previewCovers} />
      <div className="container mx-auto pt-5 px-4 xl:px-0 mt-25 md:mt-0 relative z-20">
        <div className="flex flex-col lg:flex-row gap-6 lg:place-content-evenly mb-5 lg:items-start">
          <main className="flex flex-col space-y-3 w-full lg:w-2/3 mb-5">
            <h1 className="text-2xl md:text-3xl font-bold text-primary">{detail.name}</h1>

            <div className="flex flex-wrap items-center gap-4 text-xs md:text-sm text-muted">
              {detail.type ? <span className="capitalize">{detail.type}</span> : null}
              <span className="inline-flex items-center gap-1"><BookOpen className="size-4" />{detail.worksCount} {detail.worksCount === 1 ? "work" : "works"}</span>
            </div>

            {knownFor.length > 0 && (
              <div className="pt-2">
                <HomepageMangaCarousel
                  title="Known For"
                  items={knownFor}
                  onSaveClick={(seriesId, title) => setSaveTarget({ seriesId, title })}
                  getHref={(item) => mangaPath(item.id)}
                />
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-4">
              <span className="inline-flex items-center bg-foreground p-2 rounded-md text-primary">
                <BookOpen className="size-6 mr-1" /> Works
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8 gap-4 pt-2">
              {detail.works.map((item, i) => (
                <SeriesGridCard
                  key={item.id}
                  seriesId={item.id}
                  title={item.title ?? "Untitled"}
                  cover={item.cover}
                  href={mangaPath(item.id)}
                  type={item.type}
                  status={item.status}
                  totalChapters={item.totalChapters}
                  isNew={item.isNew}
                  popularityGlobalCurrent={item.popularityGlobalCurrent}
                  popularityTypeCurrent={item.popularityTypeCurrent}
                  popularity={item.popularity}
                  onSaveClick={(seriesId, title) => setSaveTarget({ seriesId, title })}
                  priority={i < 8}
                />
              ))}
            </div>
            {detail.works.length === 0 && <p className="text-muted text-center py-8">No works found for this author.</p>}
          </main>

          <aside id="sidebar" className="flex flex-col w-full lg:w-79.75 lg:relative lg:-top-35 lg:z-25 gap-4">
            <div className="w-full md:max-w-xs lg:max-w-none mx-auto lg:mx-0 overflow-hidden rounded-md border-4 border-background shadow-md">
              <div className="grid grid-cols-2 gap-px aspect-square bg-background shadow-md">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="bg-foreground min-h-0">
                    {previewCovers[i] ? <img src={previewCovers[i]} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-muted min-h-24"><PenTool className="size-6" /></div>}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-foreground rounded-md p-4 md:p-5 w-full shadow-md">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-borders bg-background text-accent">
                  <PenTool className="size-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted mb-0.5">Author</p>
                  <p className="text-lg font-semibold text-primary truncate">{detail.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted mb-3">
                {detail.type ? <span className="capitalize">{detail.type}</span> : null}
                {detail.type ? <span>·</span> : null}
                <span>{detail.worksCount} {detail.worksCount === 1 ? "work" : "works"}</span>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleShare} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-background text-primary rounded-lg text-sm hover:bg-background/50">
                  <ShareIcon className="size-4" /> Share
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
      {saveTarget ? (
        <SeriesBookmarkModal isOpen onClose={() => setSaveTarget(null)} seriesId={saveTarget.seriesId} mangaTitle={saveTarget.title} />
      ) : null}
    </>
  );
}
