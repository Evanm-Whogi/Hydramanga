"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getProfileComments, PROFILE_PAGE_SIZE, type ProfileCommentItem } from "@/services/profileService";
import { mangaPath } from "@/lib/paths";
import ProfilePagination from "./ProfilePagination";

export default function ProfileComments({ identifier }: { identifier: string }) {
  const [comments, setComments] = useState<ProfileCommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const loadComments = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const data = await getProfileComments(identifier, nextPage, PROFILE_PAGE_SIZE);
      setComments(data.comments);
      setTotal(data.pagination.total);
      setPage(nextPage);
    } catch {
      setComments([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [identifier]);

  useEffect(() => {
    loadComments(1);
  }, [loadComments]);

  if (loading && comments.length === 0) return <div className="bg-foreground rounded-lg p-6 animate-pulse h-40" />;

  if (!loading && comments.length === 0) {
    return (
      <div className="bg-foreground rounded-lg p-6">
        <p className="text-muted">No comments yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="bg-foreground rounded-lg p-6 animate-pulse h-40" />
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="bg-foreground rounded-lg p-5">
              <div className="flex gap-4">
                <Link href={mangaPath(comment.seriesId)} className="shrink-0 w-16 aspect-2/3 overflow-hidden rounded-md">
                  <img src={comment.series.cover || "/notFound.png"} alt={comment.series.title ?? "Manga"} className="w-full h-full object-cover" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={mangaPath(comment.seriesId)} className="text-accent hover:underline font-medium">
                    {comment.series.title}
                  </Link>
                  <p className="text-xs text-muted mt-1">{new Date(comment.createdAt).toLocaleString()}</p>
                  <p className="text-primary mt-2 whitespace-pre-wrap wrap-break-word">{comment.content}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <ProfilePagination page={page} total={total} onPageChange={loadComments} loading={loading} />
    </div>
  );
}
