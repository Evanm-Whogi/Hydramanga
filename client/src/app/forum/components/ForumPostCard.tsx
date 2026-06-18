'use client';

import Link from 'next/link';
import { Lock, MessageSquare, Pin } from 'lucide-react';
import Pill from '@/components/Pill';
import UserAvatar from '@/components/UserAvatar';
import VoteBar from '@/components/social/VoteBar';
import { getForumCategoryLabel } from '@/constants/forumCategories';
import { forumExcerpt } from '@/lib/forumExcerpt';
import { formatTimeAgo } from '@/lib/utils';

export default function ForumPostCard({post, userId, onVote}: {
  post: any;
  userId?: string;
  onVote: (postId: number, type: 'like' | 'dislike') => void | Promise<void>;
}) {
  const replyCount = post.replyCount ?? 0;

  return (
    <article className="bg-foreground border border-borders shadow-md rounded-lg p-4 hover:border-accent/40 transition-colors">
      <Link href={`/forum/${post.id}`} className="flex flex-col gap-2 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <Pill text={getForumCategoryLabel(post.category)} theme="accent" size="px-2.5 py-0.5 text-xs" />
          <span className="text-muted">·</span>
          <span className="inline-flex items-center gap-1.5 text-primary">
            <UserAvatar src={post.author?.image} width={20} height={20} className="size-5 rounded-full object-cover shrink-0" />
            <span className="font-medium">{post.author?.name ?? 'Unknown'}</span>
          </span>
          <span className="text-muted">·</span>
          <span>{formatTimeAgo(post.createdAt)}</span>
          {post.isPinned ? <Pin className="size-4 text-accent shrink-0" aria-label="Pinned" /> : null}
          {post.isLocked ? <Lock className="size-4 text-red-400 shrink-0" aria-label="Locked" /> : null}
        </div>
        <h2 className="text-lg font-semibold text-primary line-clamp-1">{post.title}</h2>
        <p className="text-sm text-muted line-clamp-1">{forumExcerpt(post.content)}</p>
      </Link>
      <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-borders text-sm text-muted">
        <VoteBar votes={post.votes ?? []} itemId={post.id} userId={userId} onVote={onVote} scoreMode />
        <div className="flex items-center gap-1.5">
          <MessageSquare className="size-4 shrink-0" />
          <Link href={`/forum/${post.id}`} className="hover:text-primary">
            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
          </Link>
        </div>
      </div>
    </article>
  );
}
