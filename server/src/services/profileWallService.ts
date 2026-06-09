import { db, schema } from '@/db/index';
import { eq, and } from 'drizzle-orm';
import { buildThreadTree, type ThreadNode } from '@/lib/buildThreadTree';
import { enrichCommentsWithAuthorMeta } from '@/lib/enrichAuthors';
import { CONTENT_LIMITS, exceedsLimit } from '@/lib/securityLimits';
import { ProfileAccessError, assertProfileAccess, resolveUserId } from '@/services/profileSectionService';

export type WallPostSort = 'recent' | 'oldest' | 'top' | 'worst';
export const WALL_PAGE_LIMIT = 20;

const AUTHOR_COLUMNS = { id: true, name: true, image: true, role: true, username: true, displayUsername: true } as const;

type WallVote = { userId: string; type: string };
type FlatWallPost = {
  id: number;
  content: string;
  wallUserId: string;
  authorUserId: string;
  parentId: number | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string; image: string | null; role: string; username: string | null; displayUsername: string | null } | null;
  votes: WallVote[];
};

export type WallPostTreeNode = ThreadNode<FlatWallPost>;

function getPostScore(votes: WallVote[]): number {
  let score = 0;
  for (const v of votes) {
    if (v.type === 'like') score += 1;
    else if (v.type === 'dislike') score -= 1;
  }
  return score;
}

function sortTopLevelPosts(posts: WallPostTreeNode[], sort: WallPostSort): WallPostTreeNode[] {
  const sorted = [...posts];
  if (sort === 'recent') {
    sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (sort === 'oldest') {
    sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } else if (sort === 'top') {
    sorted.sort((a, b) => {
      const diff = getPostScore(b.votes) - getPostScore(a.votes);
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } else if (sort === 'worst') {
    sorted.sort((a, b) => {
      const diff = getPostScore(a.votes) - getPostScore(b.votes);
      if (diff !== 0) return diff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }
  return sorted;
}

class ProfileWallService {
  async getWallPosts(identifier: string, viewerUserId: string | null, options: { sort?: WallPostSort; page?: number; limit?: number } = {}) {
    const { userId } = await assertProfileAccess(identifier, viewerUserId, 'wall');
    const sort = options.sort ?? 'recent';
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(50, Math.max(1, options.limit ?? WALL_PAGE_LIMIT));

    const flat = await db.query.profileWallPosts.findMany({
      where: eq(schema.profileWallPosts.wallUserId, userId),
      with: {
        author: { columns: AUTHOR_COLUMNS },
        votes: true,
      },
    });

    const tree = buildThreadTree(flat as FlatWallPost[]);
    const sorted = sortTopLevelPosts(tree, sort);
    const total = sorted.length;
    const offset = (page - 1) * limit;
    const pagePosts = sorted.slice(offset, offset + limit);
    const enriched = await enrichCommentsWithAuthorMeta(pagePosts);

    return {
      posts: enriched,
      pagination: {
        page,
        limit,
        total,
        hasMore: offset + limit < total,
      },
    };
  }

  async createWallPost(wallIdentifier: string, authorUserId: string, content: string, parentId?: number) {
    const trimmed = content.trim();
    if (!trimmed) throw new ProfileAccessError('Content is required', 400);
    if (exceedsLimit(trimmed, CONTENT_LIMITS.comment)) throw new ProfileAccessError('Post is too long', 400);

    await assertProfileAccess(wallIdentifier, authorUserId, 'wall');
    const resolved = await resolveUserId(wallIdentifier, authorUserId);
    if (!resolved) throw new ProfileAccessError('User not found', 404);

    if (parentId) {
      const parent = await db.query.profileWallPosts.findFirst({ where: eq(schema.profileWallPosts.id, parentId) });
      if (!parent) throw new ProfileAccessError('Parent post not found', 404);
      if (parent.wallUserId !== resolved.userId) throw new ProfileAccessError('Parent post belongs to a different wall', 400);
    }

    const [post] = await db
      .insert(schema.profileWallPosts)
      .values({ wallUserId: resolved.userId, authorUserId, content: trimmed, parentId: parentId ?? null })
      .returning();

    const full = await db.query.profileWallPosts.findFirst({
      where: eq(schema.profileWallPosts.id, post.id),
      with: { author: { columns: AUTHOR_COLUMNS }, votes: true },
    });
    return full;
  }

  async updateWallPost(postId: number, actorUserId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) throw new ProfileAccessError('Content is required', 400);
    if (exceedsLimit(trimmed, CONTENT_LIMITS.comment)) throw new ProfileAccessError('Post is too long', 400);

    const [post] = await db.select().from(schema.profileWallPosts).where(eq(schema.profileWallPosts.id, postId)).limit(1);
    if (!post) throw new ProfileAccessError('Post not found', 404);
    if (post.authorUserId !== actorUserId) throw new ProfileAccessError('Forbidden', 403);

    const [updated] = await db
      .update(schema.profileWallPosts)
      .set({ content: trimmed, updatedAt: new Date() })
      .where(eq(schema.profileWallPosts.id, postId))
      .returning();

    return updated;
  }

  async deleteWallPost(postId: number, actorUserId: string, isAdmin: boolean) {
    const [post] = await db.select().from(schema.profileWallPosts).where(eq(schema.profileWallPosts.id, postId)).limit(1);
    if (!post) throw new ProfileAccessError('Post not found', 404);
    if (post.authorUserId !== actorUserId && post.wallUserId !== actorUserId && !isAdmin) {
      throw new ProfileAccessError('Forbidden', 403);
    }
    await db.delete(schema.profileWallPosts).where(eq(schema.profileWallPosts.id, postId));
  }

  async voteWallPost(identifier: string, viewerUserId: string, postId: number, type: 'like' | 'dislike') {
    const { userId: wallUserId } = await assertProfileAccess(identifier, viewerUserId, 'wall');
    const post = await db.query.profileWallPosts.findFirst({ where: eq(schema.profileWallPosts.id, postId) });
    if (!post || post.wallUserId !== wallUserId) throw new ProfileAccessError('Post not found', 404);

    const existing = await db.query.profileWallPostVotes.findFirst({
      where: and(eq(schema.profileWallPostVotes.postId, postId), eq(schema.profileWallPostVotes.userId, viewerUserId)),
    });

    if (!existing) {
      await db.insert(schema.profileWallPostVotes).values({ postId, userId: viewerUserId, type });
      return;
    }
    if (existing.type === type) {
      await db.delete(schema.profileWallPostVotes).where(and(eq(schema.profileWallPostVotes.postId, postId), eq(schema.profileWallPostVotes.userId, viewerUserId)));
      return;
    }
    await db.update(schema.profileWallPostVotes).set({ type }).where(and(eq(schema.profileWallPostVotes.postId, postId), eq(schema.profileWallPostVotes.userId, viewerUserId)));
  }
}

export const profileWallService = new ProfileWallService();
