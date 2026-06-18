import { db, schema } from '@/db/index';
import { eq, and, desc, asc, inArray, count, or, ilike, sql } from 'drizzle-orm';
import { karmaService } from '@/services/karmaService';
import { notificationService } from '@/services/notificationService';
import { buildThreadTree } from '@/lib/buildThreadTree';
import { enrichAuthors } from '@/lib/enrichAuthors';
import { badgeService } from '@/services/badgeService';
import { DEFAULT_FORUM_CATEGORY, type ForumCategory } from '@/lib/forumCategories';

export type BoardListSort = 'latest' | 'top' | 'oldest';

export type BoardListOptions = {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  sort?: BoardListSort;
};

const postVoteScoreSql = sql<number>`COALESCE((
  SELECT SUM(CASE WHEN v.type = 'like' THEN 1 WHEN v.type = 'dislike' THEN -1 ELSE 0 END)
  FROM board_post_votes v
  WHERE v.post_id = ${schema.boardPosts.id}
), 0)`;

class BoardService {
  private buildListConditions(options: BoardListOptions) {
    const conditions = [eq(schema.boardPosts.isDeleted, false)];
    if (options.category && options.category !== 'all') {
      conditions.push(eq(schema.boardPosts.category, options.category));
    }
    const query = options.q?.trim();
    if (query) {
      const term = `%${query}%`;
      conditions.push(or(ilike(schema.boardPosts.title, term), ilike(schema.boardPosts.content, term))!);
    }
    return and(...conditions);
  }

  async listPosts(options: BoardListOptions = {}) {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const offset = (page - 1) * limit;
    const sort = options.sort ?? 'latest';
    const whereClause = this.buildListConditions(options);

    const [totalRow] = await db.select({ count: count() }).from(schema.boardPosts).where(whereClause);
    const total = Number(totalRow?.count ?? 0);

    const orderBy =
      sort === 'oldest'
        ? [desc(schema.boardPosts.isPinned), asc(schema.boardPosts.createdAt)]
        : sort === 'top'
          ? [desc(schema.boardPosts.isPinned), desc(postVoteScoreSql), desc(schema.boardPosts.createdAt)]
          : [desc(schema.boardPosts.isPinned), desc(schema.boardPosts.createdAt)];

    const posts = await db.query.boardPosts.findMany({
      where: whereClause,
      with: {
        author: { columns: { id: true, name: true, image: true, role: true } },
        votes: true,
      },
      orderBy,
      limit,
      offset,
    });

    if (posts.length === 0) {
      return { posts: [], total, hasMore: false };
    }

    const postIds = posts.map((p) => p.id);
    const replyCounts = await db
      .select({
        postId: schema.boardReplies.postId,
        count: count(),
      })
      .from(schema.boardReplies)
      .where(
        and(
          eq(schema.boardReplies.isDeleted, false),
          inArray(schema.boardReplies.postId, postIds)
        )
      )
      .groupBy(schema.boardReplies.postId);

    const countMap = new Map(replyCounts.map((r) => [r.postId, Number(r.count)]));

    const withCounts = posts.map((post) => ({
      ...post,
      replyCount: countMap.get(post.id) ?? 0,
    }));

    const enriched = await enrichAuthors(withCounts);
    return { posts: enriched, total, hasMore: offset + posts.length < total };
  }

  async getPost(postId: number) {
    const post = await db.query.boardPosts.findFirst({
      where: and(eq(schema.boardPosts.id, postId), eq(schema.boardPosts.isDeleted, false)),
      with: {
        author: { columns: { id: true, name: true, image: true, role: true } },
        votes: true,
      },
    });
    if (!post) return null;

    const flatReplies = await db.query.boardReplies.findMany({
      where: and(eq(schema.boardReplies.postId, postId), eq(schema.boardReplies.isDeleted, false)),
      with: {
        author: { columns: { id: true, name: true, image: true, role: true } },
        votes: true,
      },
    });

    const replyTree = buildThreadTree(flatReplies);
    const [enrichedPost] = await enrichAuthors([post]);
    const enrichedReplies = await this.enrichReplyTree(replyTree);

    return { post: enrichedPost, replies: enrichedReplies };
  }

  private async enrichReplyTree<T extends { author?: { id: string } | null; replies: T[] }>(nodes: T[]): Promise<T[]> {
    const enriched = await enrichAuthors(nodes);
    return Promise.all(
      enriched.map(async (node) => {
        if (!node.replies?.length) return node;
        const replies = await this.enrichReplyTree(node.replies);
        return { ...node, replies };
      })
    );
  }

  async createPost(userId: string, title: string, content: string, category: ForumCategory = DEFAULT_FORUM_CATEGORY) {
    const [post] = await db
      .insert(schema.boardPosts)
      .values({ userId, title: title.trim(), content: content.trim(), category })
      .returning();

    await karmaService.award({
      userId,
      action: 'board_post',
      sourceType: 'board_post',
      sourceId: String(post.id),
      idempotencyKey: `board_post:${post.id}`,
    });

    badgeService.evaluateBadgesAsync(userId, 'board_post');

    return post;
  }

  async createReply(userId: string, postId: number, content: string, parentId?: number) {
    const post = await db.query.boardPosts.findFirst({
      where: eq(schema.boardPosts.id, postId),
    });
    if (!post || post.isDeleted) throw new Error('Post not found');
    if (post.isLocked) throw new Error('Post is locked');

    if (parentId) {
      const parentReply = await db.query.boardReplies.findFirst({
        where: eq(schema.boardReplies.id, parentId),
      });
      if (!parentReply || parentReply.isDeleted) throw new Error('Parent reply not found');
      if (parentReply.postId !== postId) throw new Error('Parent reply belongs to a different post');
    }

    const [reply] = await db
      .insert(schema.boardReplies)
      .values({
        userId,
        postId,
        content: content.trim(),
        parentId: parentId ?? null,
      })
      .returning();

    await karmaService.award({
      userId,
      action: 'board_reply',
      sourceType: 'board_reply',
      sourceId: String(reply.id),
      idempotencyKey: `board_reply:${reply.id}`,
    });

    badgeService.evaluateBadgesAsync(userId, 'board_reply');
    badgeService.evaluateBadgesAsync(post.userId, 'board_reply');

    const [replier] = await db
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    const replierName = replier?.name || 'Someone';

    const recipients = new Set<string>();
    if (post.userId !== userId) recipients.add(post.userId);

    if (parentId) {
      const parentReply = await db.query.boardReplies.findFirst({
        where: eq(schema.boardReplies.id, parentId),
      });
      if (parentReply && parentReply.userId !== userId) {
        recipients.add(parentReply.userId);
      }
    }

    for (const recipientUserId of recipients) {
      notificationService
        .notifyBoardReply({
          recipientUserId,
          replierName,
          postTitle: post.title,
          postId: post.id,
        })
        .catch(() => undefined);
    }

    return reply;
  }

  async votePost(userId: string, postId: number, type: 'like' | 'dislike') {
    const existing = await db.query.boardPostVotes.findFirst({
      where: and(eq(schema.boardPostVotes.postId, postId), eq(schema.boardPostVotes.userId, userId)),
    });

    if (!existing) {
      await db.insert(schema.boardPostVotes).values({ postId, userId, type });
      return;
    }
    if (existing.type === type) {
      await db
        .delete(schema.boardPostVotes)
        .where(
          and(eq(schema.boardPostVotes.postId, postId), eq(schema.boardPostVotes.userId, userId))
        );
      return;
    }
    await db
      .update(schema.boardPostVotes)
      .set({ type })
      .where(and(eq(schema.boardPostVotes.postId, postId), eq(schema.boardPostVotes.userId, userId)));
  }

  async voteReply(userId: string, replyId: number, type: 'like' | 'dislike') {
    const existing = await db.query.boardReplyVotes.findFirst({
      where: and(eq(schema.boardReplyVotes.replyId, replyId), eq(schema.boardReplyVotes.userId, userId)),
    });

    if (!existing) {
      await db.insert(schema.boardReplyVotes).values({ replyId, userId, type });
      return;
    }
    if (existing.type === type) {
      await db
        .delete(schema.boardReplyVotes)
        .where(
          and(eq(schema.boardReplyVotes.replyId, replyId), eq(schema.boardReplyVotes.userId, userId))
        );
      return;
    }
    await db
      .update(schema.boardReplyVotes)
      .set({ type })
      .where(
        and(eq(schema.boardReplyVotes.replyId, replyId), eq(schema.boardReplyVotes.userId, userId))
      );
  }

  async softDeletePost(postId: number, deletedBy: string) {
    const [post] = await db
      .select({ userId: schema.boardPosts.userId })
      .from(schema.boardPosts)
      .where(eq(schema.boardPosts.id, postId))
      .limit(1);

    await db
      .update(schema.boardPosts)
      .set({ isDeleted: true, deletedBy, updatedAt: new Date() })
      .where(eq(schema.boardPosts.id, postId));

    if (post) {
      await karmaService.reverse({
        userId: post.userId,
        action: 'board_post',
        sourceType: 'board_post',
        sourceId: String(postId),
        originalIdempotencyKey: `board_post:${postId}`,
      });
    }
  }

  async adminUpdatePost(
    postId: number,
    updates: { isPinned?: boolean; isLocked?: boolean; isDeleted?: boolean },
    adminId: string
  ) {
    if (updates.isDeleted) {
      await this.softDeletePost(postId, adminId);
      return;
    }
    await db
      .update(schema.boardPosts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.boardPosts.id, postId));
  }

  async updatePost(userId: string, postId: number, data: { title?: string; content?: string; category?: ForumCategory }) {
    const post = await db.query.boardPosts.findFirst({
      where: and(eq(schema.boardPosts.id, postId), eq(schema.boardPosts.isDeleted, false)),
    });
    if (!post) throw new Error('Post not found');
    if (post.userId !== userId) throw new Error('Forbidden');

    const [updated] = await db
      .update(schema.boardPosts)
      .set({
        title: data.title?.trim() ?? post.title,
        content: data.content?.trim() ?? post.content,
        category: data.category ?? post.category,
        updatedAt: new Date(),
      })
      .where(eq(schema.boardPosts.id, postId))
      .returning();
    return updated;
  }

  async deletePost(userId: string, postId: number, isAdmin: boolean) {
    const post = await db.query.boardPosts.findFirst({
      where: eq(schema.boardPosts.id, postId),
    });
    if (!post || post.isDeleted) throw new Error('Post not found');
    if (!isAdmin && post.userId !== userId) throw new Error('Forbidden');
    await this.softDeletePost(postId, userId);
  }

  async updateReply(userId: string, replyId: number, content: string) {
    const reply = await db.query.boardReplies.findFirst({
      where: and(eq(schema.boardReplies.id, replyId), eq(schema.boardReplies.isDeleted, false)),
    });
    if (!reply) throw new Error('Reply not found');
    if (reply.userId !== userId) throw new Error('Forbidden');

    const [updated] = await db
      .update(schema.boardReplies)
      .set({ content: content.trim(), updatedAt: new Date() })
      .where(eq(schema.boardReplies.id, replyId))
      .returning();
    return updated;
  }

  async deleteReply(userId: string, replyId: number, isAdmin: boolean) {
    const reply = await db.query.boardReplies.findFirst({
      where: eq(schema.boardReplies.id, replyId),
    });
    if (!reply || reply.isDeleted) throw new Error('Reply not found');
    if (!isAdmin && reply.userId !== userId) throw new Error('Forbidden');

    await db
      .update(schema.boardReplies)
      .set({ isDeleted: true, deletedBy: userId, updatedAt: new Date() })
      .where(eq(schema.boardReplies.id, replyId));
  }
}

export const boardService = new BoardService();
