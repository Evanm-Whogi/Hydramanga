import { db, schema } from '@/db/index';
import { eq, and, isNull } from 'drizzle-orm';
import { buildThreadTree, type ThreadNode } from '@/lib/buildThreadTree';
import { enrichCommentsWithAuthorMeta } from '@/lib/enrichAuthors';

export type CommentSort = 'recent' | 'oldest' | 'top' | 'worst';

export const COMMENT_PAGE_LIMIT = 50;

const AUTHOR_COLUMNS = { id: true, name: true, image: true, role: true, username: true, displayUsername: true } as const;

type CommentVote = { userId: string; type: string };
type FlatComment = {
  id: number;
  content: string;
  userId: string;
  seriesId: number;
  chapterId: number | null;
  parentId: number | null;
  isSpoiler: boolean;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string; image: string | null; role: string; username: string | null; displayUsername: string | null } | null;
  votes: CommentVote[];
};

export type CommentTreeNode = ThreadNode<FlatComment>;

function getCommentScore(votes: CommentVote[]): number {
  let score = 0;
  for (const v of votes) {
    if (v.type === 'like') score += 1;
    else if (v.type === 'dislike') score -= 1;
  }
  return score;
}

function sortTopLevel(comments: CommentTreeNode[], sort: CommentSort): CommentTreeNode[] {
  const sorted = [...comments];
  if (sort === 'recent') {
    sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (sort === 'oldest') {
    sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } else if (sort === 'top') {
    sorted.sort((a, b) => {
      const diff = getCommentScore(b.votes) - getCommentScore(a.votes);
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } else if (sort === 'worst') {
    sorted.sort((a, b) => {
      const diff = getCommentScore(a.votes) - getCommentScore(b.votes);
      if (diff !== 0) return diff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }
  return sorted;
}

export async function fetchSeriesComments(seriesId: number, options: { sort?: CommentSort; page?: number; limit?: number } = {}) {
  return fetchScopedComments(seriesId, null, options);
}

export async function fetchChapterComments(seriesId: number, chapterId: number, options: { sort?: CommentSort; page?: number; limit?: number } = {}) {
  return fetchScopedComments(seriesId, chapterId, options);
}

async function fetchScopedComments(seriesId: number, chapterId: number | null, options: { sort?: CommentSort; page?: number; limit?: number } = {}) {
  const sort = options.sort ?? 'recent';
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? COMMENT_PAGE_LIMIT));

  const scopeCondition = chapterId == null
    ? and(eq(schema.comments.seriesId, seriesId), isNull(schema.comments.chapterId))
    : and(eq(schema.comments.seriesId, seriesId), eq(schema.comments.chapterId, chapterId));

  const flat = await db.query.comments.findMany({
    where: scopeCondition,
    with: {
      author: { columns: AUTHOR_COLUMNS },
      votes: true,
    },
  });

  const tree = buildThreadTree(flat as FlatComment[]);
  const sorted = sortTopLevel(tree, sort);
  const total = sorted.length;
  const offset = (page - 1) * limit;
  const pageComments = sorted.slice(offset, offset + limit);

  const enriched = await enrichCommentsWithAuthorMeta(pageComments);

  return {
    comments: enriched,
    pagination: {
      page,
      limit,
      total,
      hasMore: offset + limit < total,
    },
  };
}

export async function validateCommentParent(seriesId: number, parentId: number, chapterId?: number | null): Promise<{ ok: true } | { ok: false; message: string }> {
  const parent = await db.query.comments.findFirst({
    where: eq(schema.comments.id, parentId),
  });
  if (!parent) return { ok: false, message: 'Parent comment not found' };
  if (parent.seriesId !== seriesId) return { ok: false, message: 'Parent comment belongs to a different series' };
  const expectedChapterId = chapterId ?? null;
  const parentChapterId = parent.chapterId ?? null;
  if (parentChapterId !== expectedChapterId) return { ok: false, message: 'Parent comment belongs to a different thread' };
  return { ok: true };
}

export const commentService = { fetchSeriesComments, fetchChapterComments, validateCommentParent, COMMENT_PAGE_LIMIT };
