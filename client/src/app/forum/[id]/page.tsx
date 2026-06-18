import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ForumPostClient from "./ForumPostClient";
import { buildPageMetadata } from "@/lib/seo";
import { getBoardPost } from "@/services/boardService";

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const postId = parseInt(id, 10);
  if (!Number.isFinite(postId)) {
    return buildPageMetadata({ title: 'Forum Post', path: '/forum' });
  }
  try {
    const data = await getBoardPost(postId) as { post?: { title?: string } };
    const title = data?.post?.title;
    if (!title) {
      return buildPageMetadata({ title: 'Forum Post', path: `/forum/${postId}` });
    }
    return buildPageMetadata({ title, description: `Forum discussion: ${title}`, path: `/forum/${postId}` });
  } catch {
    return buildPageMetadata({ title: 'Forum Post', path: `/forum/${postId}` });
  }
}

export default async function ForumPostPage({ params }: PageProps) {
  const { id } = await params;
  const postId = parseInt(id, 10);
  if (!Number.isFinite(postId)) notFound();
  return <ForumPostClient postId={postId} />;
}
