import { db, schema } from '@/db/index';
import { eq, desc, lt, and } from 'drizzle-orm';
import Redis from 'ioredis';
import { appConfig } from '@/config/appConfig';

export const CHAT_CHANNEL = 'chat:global';
export const CHAT_ROOM = 'chat:global';

const redisPublisher = new Redis({
  host: appConfig.redis.host,
  port: appConfig.redis.port,
  password: appConfig.redis.password,
  ...(appConfig.redis.db != null && { db: appConfig.redis.db }),
});

export interface ChatMessagePayload {
  id: number;
  userId: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; image: string | null; role: string; levelName?: string };
}

import { enrichAuthors } from '@/lib/enrichAuthors';
import { normalizeUserContent } from '@/lib/normalizeUserContent';
import { CONTENT_LIMITS, exceedsLimit } from '@/lib/securityLimits';
import { validateContentImagesAsync } from '@/lib/externalImageValidation';

class ChatService {
  async isUserMuted(userId: string): Promise<{ muted: boolean; reason?: string }> {
    const row = await db.query.userModeration.findFirst({
      where: eq(schema.userModeration.userId, userId),
    });
    if (!row?.isChatMuted) return { muted: false };
    if (row.mutedUntil && new Date(row.mutedUntil) < new Date()) {
      await db
        .update(schema.userModeration)
        .set({ isChatMuted: false, mutedUntil: null, updatedAt: new Date() })
        .where(eq(schema.userModeration.userId, userId));
      return { muted: false };
    }
    return { muted: true, reason: row.mutedReason ?? undefined };
  }

  async getMessages(limit = 50, beforeId?: number) {
    const conditions = [eq(schema.chatMessages.isDeleted, false)];
    if (beforeId) {
      conditions.push(lt(schema.chatMessages.id, beforeId));
    }

    const messages = await db.query.chatMessages.findMany({
      where: and(...conditions),
      with: {
        author: { columns: { id: true, name: true, image: true, role: true, username: true, displayUsername: true } },
      },
      orderBy: [desc(schema.chatMessages.createdAt)],
      limit,
    });

    return enrichAuthors(messages.reverse());
  }

  async createMessage(userId: string, content: string): Promise<ChatMessagePayload> {
    const trimmed = normalizeUserContent(content);
    if (!trimmed) throw new Error('Message cannot be empty');
    if (exceedsLimit(trimmed, CONTENT_LIMITS.chatMessage)) {
      throw new Error(`Message must be at most ${CONTENT_LIMITS.chatMessage} characters`);
    }
    const imageError = await validateContentImagesAsync(trimmed);
    if (imageError) throw new Error(imageError);

    const mute = await this.isUserMuted(userId);
    if (mute.muted) throw new Error(mute.reason ?? 'You are muted from chat');

    const [msg] = await db
      .insert(schema.chatMessages)
      .values({ userId, content: trimmed })
      .returning();

    const [author] = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        username: schema.user.username,
        displayUsername: schema.user.displayUsername,
        image: schema.user.image,
        role: schema.user.role,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    const payload: ChatMessagePayload = {
      id: msg.id,
      userId: msg.userId,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
      author: author ?? {
        id: userId,
        name: 'Unknown',
        image: '/default-avatar.jpg',
        role: 'user',
      },
    };

    const [enriched] = await enrichAuthors([{ author: payload.author }]);
    if (enriched.author) payload.author = enriched.author as ChatMessagePayload['author'];

    await redisPublisher.publish(CHAT_CHANNEL, JSON.stringify({ type: 'message', data: payload }));
    return payload;
  }

  async deleteMessage(messageId: number, deletedBy: string, isAdmin: boolean) {
    const msg = await db.query.chatMessages.findFirst({
      where: eq(schema.chatMessages.id, messageId),
    });
    if (!msg || msg.isDeleted) throw new Error('Message not found');
    if (!isAdmin && msg.userId !== deletedBy) throw new Error('Forbidden');

    await db
      .update(schema.chatMessages)
      .set({ isDeleted: true, deletedBy })
      .where(eq(schema.chatMessages.id, messageId));

    await redisPublisher.publish(
      CHAT_CHANNEL,
      JSON.stringify({ type: 'message_deleted', data: { id: messageId } })
    );
  }

  async updateMessage(messageId: number, userId: string, content: string) {
    const trimmed = normalizeUserContent(content);
    if (!trimmed) throw new Error('Message cannot be empty');
    if (exceedsLimit(trimmed, CONTENT_LIMITS.chatMessage)) {
      throw new Error(`Message must be at most ${CONTENT_LIMITS.chatMessage} characters`);
    }
    const imageError = await validateContentImagesAsync(trimmed);
    if (imageError) throw new Error(imageError);

    const msg = await db.query.chatMessages.findFirst({
      where: and(eq(schema.chatMessages.id, messageId), eq(schema.chatMessages.isDeleted, false)),
    });
    if (!msg) throw new Error('Message not found');
    if (msg.userId !== userId) throw new Error('Forbidden');

    const [updated] = await db
      .update(schema.chatMessages)
      .set({ content: trimmed })
      .where(eq(schema.chatMessages.id, messageId))
      .returning();

    const [author] = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        username: schema.user.username,
        displayUsername: schema.user.displayUsername,
        image: schema.user.image,
        role: schema.user.role,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    const payload: ChatMessagePayload = {
      id: updated.id,
      userId: updated.userId,
      content: updated.content,
      createdAt: updated.createdAt.toISOString(),
      author: author ?? {
        id: userId,
        name: 'Unknown',
        image: '/default-avatar.jpg',
        role: 'user',
      },
    };

    const [enriched] = await enrichAuthors([{ author: payload.author }]);
    if (enriched.author) payload.author = enriched.author as ChatMessagePayload['author'];

    await redisPublisher.publish(CHAT_CHANNEL, JSON.stringify({ type: 'message_updated', data: payload }));
    return payload;
  }

  async muteUser(targetUserId: string, adminId: string, options: { hours?: number; reason?: string }) {
    const mutedUntil =
      options.hours && options.hours > 0
        ? new Date(Date.now() + options.hours * 60 * 60 * 1000)
        : null;

    const existing = await db.query.userModeration.findFirst({
      where: eq(schema.userModeration.userId, targetUserId),
    });

    if (existing) {
      await db
        .update(schema.userModeration)
        .set({
          isChatMuted: true,
          mutedUntil,
          mutedReason: options.reason ?? null,
          updatedAt: new Date(),
        })
        .where(eq(schema.userModeration.userId, targetUserId));
    } else {
      await db.insert(schema.userModeration).values({
        userId: targetUserId,
        isChatMuted: true,
        mutedUntil,
        mutedReason: options.reason ?? null,
      });
    }

    await redisPublisher.publish(
      CHAT_CHANNEL,
      JSON.stringify({
        type: 'user_muted',
        data: { userId: targetUserId, mutedUntil, reason: options.reason },
      })
    );
  }

  async unmuteUser(targetUserId: string) {
    await db
      .update(schema.userModeration)
      .set({ isChatMuted: false, mutedUntil: null, mutedReason: null, updatedAt: new Date() })
      .where(eq(schema.userModeration.userId, targetUserId));

    await redisPublisher.publish(
      CHAT_CHANNEL,
      JSON.stringify({ type: 'user_unmuted', data: { userId: targetUserId } })
    );
  }
}

export const chatService = new ChatService();
