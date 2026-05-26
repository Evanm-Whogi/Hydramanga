import { db, schema } from '@/db/index';
import { eq, and, desc, sql, inArray, count } from 'drizzle-orm';
import { karmaService } from '@/services/karmaService';
import { notificationService } from '@/services/notificationService';

type AuthorWithRank = {
  id: string;
  name: string;
  image: string | null;
  role: string;
  levelName: string;
};

class BoardService {
  private async enrichAuthors<T extends { author?: { id: string } | null }>(items: T[]): Promise<T[]> {
    const userIds = [...new Set(items.map((i) => i.author?.id).filter(Boolean))] as string[];
    const karmaMap = await karmaService.getKarmaSummaries(userIds);

    return items.map((item) => {
      if (!item.author) return item;
      const karma = karmaMap[item.author.id];
      return {
        ...item,
        author: {
          ...item.author,
          levelName: karma?.levelName ?? 'Rookie Reader',
        } as AuthorWithRank,
      };
    });
  }

  async listPosts(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const posts = await db.query.boardPosts.findMany({
      where: eq(schema.boardPosts.isDeleted, false),
      with: {
        author: { columns: { id: true, name: true, image: true, role: true } },
        votes: true,
      },
      orderBy: [desc(schema.boardPosts.isPinned), desc(schema.boardPosts.createdAt)],
      limit,
      offset,
    });

    if (posts.length === 0) return [];

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

    return this.enrichAuthors(withCounts);
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

    const replies = await db.query.boardReplies.findMany({
      where: and(eq(schema.boardReplies.postId, postId), eq(schema.boardReplies.isDeleted, false)),
      with: {
        author: { columns: { id: true, name: true, image: true, role: true } },
        votes: true,
      },
      orderBy: (r, { asc }) => [asc(r.createdAt)],
    });

    const [enrichedPost] = await this.enrichAuthors([post]);
    const enrichedReplies = await this.enrichAuthors(replies);

    return { post: enrichedPost, replies: enrichedReplies };
  }

  async createPost(userId: string, title: string, content: string) {
    const [post] = await db
      .insert(schema.boardPosts)
      .values({ userId, title: title.trim(), content: content.trim() })
      .returning();

    await karmaService.award({
      userId,
      action: 'board_post',
      sourceType: 'board_post',
      sourceId: String(post.id),
      idempotencyKey: `board_post:${post.id}`,
    });

    return post;
  }

  async createReply(userId: string, postId: number, content: string, parentId?: number) {
    const post = await db.query.boardPosts.findFirst({
      where: eq(schema.boardPosts.id, postId),
    });
    if (!post || post.isDeleted) throw new Error('Post not found');
    if (post.isLocked) throw new Error('Post is locked');

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

  async updatePost(userId: string, postId: number, data: { title?: string; content?: string }) {
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
