"use client";

import { useState, memo } from "react";
import Link from "next/link";
import UserAvatar from "@/components/UserAvatar";
import { Eye, Bookmark, ThumbsUp, ThumbsDown, ShareIcon, Flag, Pencil, ListIcon, Lock, Globe, BookOpen, MessageCircleMore } from "lucide-react";
import { toast } from "react-toastify";
import { useUser } from "@/providers/UserProvider";
import { useListViewTracking } from "@/hooks/useViewTracking";
import { formatCompactNumber } from "@/lib/utils";
import { voteList, saveList, unsaveList, type CuratedListDetail } from "@/services/curatedListService";
import { toastApiError } from "@/lib/rateLimit";
import { requireAuth } from "@/lib/requireAuth";
import SeriesGridCard from "@/components/SeriesGridCard";
import SeriesBookmarkModal from "@/components/SeriesBookmarkModal";
import { mangaPath } from "@/lib/paths";
import ListComments from "./ListComments";
import EditListModal from "../../components/EditListModal";
import ReportListModal from "../../components/ReportListModal";
import type { ListCommentNode, ListCommentPagination } from "@/services/curatedListService";

type ListTab = "manga" | "comments";

const ListBanner = memo(({ covers }: { covers: string[] }) => {
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
                <ListIcon className="size-8 text-muted opacity-40" />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-background/20 to-background/60 pointer-events-none" />
    </div>
  );
});
ListBanner.displayName = "ListBanner";

export default function ListDetailClient({ list: initialList, initialComments, initialPagination }: {
  list: CuratedListDetail;
  initialComments: ListCommentNode[];
  initialPagination?: ListCommentPagination;
}) {
  const { user } = useUser();
  const [list, setList] = useState(initialList);
  const [tab, setTab] = useState<ListTab>("manga");
  const [showEdit, setShowEdit] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [saveTarget, setSaveTarget] = useState<{ seriesId: number; title: string } | null>(null);

  useListViewTracking(list.id, true);

  const authorHref = list.author?.username ? `/users/${list.author.username}` : list.author?.id ? `/users/${list.author.id}` : "#";
  const authorName = list.author?.displayUsername || list.author?.username || list.author?.name || "Unknown";

  const handleVote = async (type: "like" | "dislike") => {
    if (!requireAuth(user, `/lists/${list.id}`)) return;
    try {
      const result = await voteList(list.id, type);
      setList((prev) => {
        let likeCount = prev.likeCount;
        let dislikeCount = prev.dislikeCount;
        const prevVote = prev.userVote;
        if (prevVote === type) {
          if (type === "like") likeCount -= 1;
          else dislikeCount -= 1;
        } else if (prevVote) {
          if (type === "like") { likeCount += 1; dislikeCount -= 1; }
          else { dislikeCount += 1; likeCount -= 1; }
        } else {
          if (type === "like") likeCount += 1;
          else dislikeCount += 1;
        }
        return { ...prev, likeCount, dislikeCount, userVote: result.userVote };
      });
    } catch (err) {
      toastApiError(err, "Failed to vote");
    }
  };

  const handleSave = async () => {
    if (!requireAuth(user, `/lists/${list.id}`)) return;
    try {
      if (list.userSaved) {
        await unsaveList(list.id);
        setList((prev) => ({ ...prev, userSaved: false, saveCount: Math.max(0, prev.saveCount - 1) }));
        toast.success("List removed from saved");
      } else {
        await saveList(list.id);
        setList((prev) => ({ ...prev, userSaved: true, saveCount: prev.saveCount + 1 }));
        toast.success("List saved");
      }
    } catch (err) {
      toastApiError(err, "Failed to save list");
    }
  };

  const handleShare = async () => {
    if (list.visibility === "private" && !list.isOwner) {
      toast.error("This list is private");
      return;
    }
    const url = `${window.location.origin}/lists/${list.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(list.visibility === "private" ? "Link copied — only you can view this private list" : "Link copied!");
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <>
      <ListBanner covers={list.previewCovers ?? []} />
      <div className="container mx-auto pt-5 px-4 xl:px-0 mt-25 md:mt-0 relative z-20">
        <div className="flex flex-col lg:flex-row gap-6 lg:place-content-evenly mb-5 lg:items-start">
          <main className="flex flex-col space-y-3 w-full lg:w-2/3 mb-5">
            <h1 className="text-2xl md:text-3xl font-bold text-primary">{list.title}</h1>
            {list.description ? <p className="text-muted text-sm md:text-base whitespace-pre-wrap">{list.description}</p> : null}

            <div className="flex flex-wrap items-center gap-4 text-xs md:text-sm text-muted">
              <span className="inline-flex items-center gap-1"><Eye className="size-4 text-blue-400" /><span className="font-semibold">{formatCompactNumber(list.viewCount)}</span> views</span>
              <span className="inline-flex items-center gap-1"><ListIcon className="size-4" />{list.itemCount} items</span>
              <span className="inline-flex items-center gap-1"><Bookmark className="size-4 text-yellow-400" /><span className="font-semibold">{formatCompactNumber(list.saveCount)}</span> saves</span>
              <button type="button" onClick={() => handleVote("like")} className={`inline-flex items-center gap-1 hover:cursor-pointer transition-colors ${list.userVote === "like" ? "text-green-400" : "text-muted hover:text-green-400"}`}>
                <ThumbsUp className="size-4" />
                <span className="tabular-nums font-semibold">{list.likeCount}</span>
              </button>
              <button type="button" onClick={() => handleVote("dislike")} className={`inline-flex items-center gap-1 hover:cursor-pointer transition-colors ${list.userVote === "dislike" ? "text-red-400" : "text-muted hover:text-red-400"}`}>
                <ThumbsDown className="size-4" />
                <span className="tabular-nums font-semibold">{list.dislikeCount}</span>
              </button>
              {!list.isOwner && (
                <button type="button" onClick={handleSave} className={`inline-flex items-center gap-1 hover:cursor-pointer transition-colors ${list.userSaved ? "text-accent" : "text-muted hover:text-accent"}`}>
                  <Bookmark className={`size-4 ${list.userSaved ? "fill-accent" : ""}`} />
                  {list.userSaved ? "Saved" : "Save"}
                </button>
              )}
              {user && !list.isOwner && (
                <button type="button" onClick={() => setShowReport(true)} className="inline-flex items-center gap-1 text-muted hover:text-primary hover:cursor-pointer transition-colors">
                  <Flag className="size-4" /> Report
                </button>
              )}
            </div>

            {list.genreTags?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {list.genreTags.map((g) => (
                  <Link key={g.name} href={`/discover?genres=${encodeURIComponent(g.name)}`} className="bg-foreground w-fit px-2 py-1 rounded-lg text-xs md:text-sm capitalize hover:bg-foreground/50">
                    {g.name} <span className="text-muted">({g.count})</span>
                  </Link>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-4">
              <button type="button" onClick={() => setTab("manga")} className={`inline-flex items-center bg-foreground hover:bg-foreground/50 p-2 rounded-md cursor-pointer border-none transition-all ${tab === "manga" ? "text-primary" : "text-muted"}`}>
                <BookOpen className="size-6 mr-1" /> Manga
              </button>
              <button type="button" onClick={() => setTab("comments")} className={`inline-flex items-center bg-foreground hover:bg-foreground/50 p-2 rounded-md cursor-pointer border-none transition-all ${tab === "comments" ? "text-primary" : "text-muted"}`}>
                <MessageCircleMore className="size-6 mr-1" /> Comments
              </button>
            </div>

            {tab === "manga" && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8 gap-4 pt-2">
                  {list.items.map((item, i) => (
                    <SeriesGridCard
                      key={item.id}
                      seriesId={item.id}
                      title={item.title ?? "Untitled"}
                      cover={item.cover}
                      href={mangaPath(item.id)}
                      type={item.type}
                      status={item.status}
                      rating={item.rating}
                      views={item.views}
                      totalChapters={item.totalChapters}
                      isNew={item.isNew}
                      onSaveClick={(seriesId, title) => setSaveTarget({ seriesId, title })}
                      priority={i < 8}
                    />
                  ))}
                </div>
                {!list.items.length && <p className="text-muted text-center py-8">This list has no manga yet.</p>}
              </>
            )}
            {tab === "comments" && (
              <ListComments listId={list.id} initialComments={initialComments} initialPagination={initialPagination} hideTitle />
            )}
          </main>

          <aside id="sidebar" className="flex flex-col w-full lg:w-79.75 lg:relative lg:-top-35 lg:z-25 gap-4">
            <div className="w-full md:max-w-xs lg:max-w-none mx-auto lg:mx-0 overflow-hidden rounded-md border-4 border-background shadow-md">
              <div className="grid grid-cols-2 gap-px aspect-square bg-background shadow-md">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="bg-foreground min-h-0">
                    {list.previewCovers?.[i] ? <img src={list.previewCovers[i]} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-muted min-h-24"><ListIcon className="size-6" /></div>}
                  </div>
                ))}
              </div>
            </div>

            {list.author && (
              <div className="bg-foreground rounded-md p-4 md:p-5 w-full shadow-md">
                <div className="flex items-center gap-3 mb-3">
                  <UserAvatar src={list.author.image} alt={authorName} width={48} height={48} className="rounded-full border border-borders object-cover size-12" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted mb-0.5">Created by</p>
                    <Link href={authorHref} className="text-lg font-semibold text-primary hover:text-accent truncate block">{authorName}</Link>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted mb-3">
                  {list.visibility === "private" ? <Lock className="size-4" /> : <Globe className="size-4 text-accent" />}
                  <span className="capitalize">{list.visibility}</span>
                  <span>·</span>
                  <span>{list.itemCount} manga</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={handleShare} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-background text-primary rounded-lg text-sm hover:bg-background/50">
                    <ShareIcon className="size-4" /> Share
                  </button>
                  {list.isOwner && (
                    <button type="button" onClick={() => setShowEdit(true)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm hover:opacity-90">
                      <Pencil className="size-4" /> Edit
                    </button>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
      {showEdit && <EditListModal listId={list.id} initialList={list} onClose={() => setShowEdit(false)} onUpdated={(updated) => setList(updated)} />}
      {showReport && <ReportListModal listId={list.id} listTitle={list.title} onClose={() => setShowReport(false)} />}
      {saveTarget ? (
        <SeriesBookmarkModal isOpen onClose={() => setSaveTarget(null)} seriesId={saveTarget.seriesId} mangaTitle={saveTarget.title} />
      ) : null}
    </>
  );
}
