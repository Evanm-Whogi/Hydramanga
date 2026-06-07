import { karmaService } from '@/services/karmaService';
import { badgeService } from '@/services/badgeService';
import type { EarnedBadge } from '@/config/badgeConfig';

type WithAuthor = { author?: { id: string } | null };

export type EnrichedAuthor = {
  id: string;
  levelName?: string;
  karmaTotal?: number;
  badges?: EarnedBadge[];
};

/** Attach levelName, karmaTotal, and badges to author objects. */
export async function enrichAuthors<T extends WithAuthor>(items: T[]): Promise<T[]> {
  const userIds = [...new Set(items.map((i) => i.author?.id).filter(Boolean))] as string[];
  if (userIds.length === 0) return items;

  const [karmaMap, badgeMap] = await Promise.all([
    karmaService.getKarmaSummaries(userIds),
    badgeService.getBadgesForUsers(userIds),
  ]);

  return items.map((item) => {
    if (!item.author) return item;
    const karma = karmaMap[item.author.id];
    return {
      ...item,
      author: {
        ...item.author,
        levelName: karma?.levelName ?? 'Rookie Reader',
        karmaTotal: karma?.totalKarma ?? 0,
        badges: badgeMap[item.author.id] ?? [],
      },
    };
  });
}

type CommentTreeItem = WithAuthor & { replies?: CommentTreeItem[] };

async function enrichCommentTree(comments: CommentTreeItem[]): Promise<CommentTreeItem[]> {
  const enriched = await enrichAuthors(comments);
  return Promise.all(
    enriched.map(async (comment) => {
      if (!comment.replies?.length) return comment;
      const replies = await enrichCommentTree(comment.replies);
      return { ...comment, replies };
    })
  );
}

/** Enrich authors on comments and all nested replies. */
export async function enrichCommentsWithAuthorMeta(comments: CommentTreeItem[]): Promise<CommentTreeItem[]> {
  return enrichCommentTree(comments);
}

/** @deprecated Use enrichCommentsWithAuthorMeta */
export const enrichCommentsWithKarma = enrichCommentsWithAuthorMeta;
