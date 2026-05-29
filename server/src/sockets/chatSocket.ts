import Redis from 'ioredis';
import { Namespace, Server, Socket } from 'socket.io';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '@/utils/auth';
import { isUserBanned } from '@/lib/banHelpers';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { CHAT_CHANNEL, CHAT_ROOM } from '@/services/chatService';

export type ChatPresenceUser = {
  id: string;
  name: string;
  username?: string | null;
  displayUsername?: string | null;
  image: string | null;
  role: string;
};

type PresenceEntry = ChatPresenceUser & { connections: number; username?: string | null; displayUsername?: string | null };

const presenceByUserId = new Map<string, PresenceEntry>();

function getPresenceList(): ChatPresenceUser[] {
  return Array.from(presenceByUserId.values()).map(({ id, name, username, displayUsername, image, role }) => ({
    id,
    name,
    username,
    displayUsername,
    image,
    role,
  }));
}

function broadcastPresence(chatNamespace: Namespace) {
  chatNamespace.to(CHAT_ROOM).emit('chat', {
    type: 'presence',
    data: { users: getPresenceList() },
  });
}

function addPresence(user: ChatPresenceUser) {
  const existing = presenceByUserId.get(user.id);
  if (existing) {
    existing.connections += 1;
    existing.name = user.name;
    existing.username = user.username;
    existing.displayUsername = user.displayUsername;
    existing.image = user.image;
    existing.role = user.role;
  } else {
    presenceByUserId.set(user.id, { ...user, connections: 1 });
  }
}

function removePresence(userId: string) {
  const existing = presenceByUserId.get(userId);
  if (!existing) return;
  existing.connections -= 1;
  if (existing.connections <= 0) presenceByUserId.delete(userId);
}

function startChatRedisSubscriber(io: Server) {
  const subscriber = new Redis({
    host: appConfig.redis.host,
    port: appConfig.redis.port,
    password: appConfig.redis.password,
    ...(appConfig.redis.db != null && { db: appConfig.redis.db }),
  });

  subscriber.subscribe(CHAT_CHANNEL, (err) => {
    if (err) {
      logger.error(`Chat Redis subscribe error: ${err}`, { service: 'chatSocket' });
      return;
    }
    logger.info(`Subscribed to Redis channel ${CHAT_CHANNEL}`, { service: 'chatSocket' });
  });

  subscriber.on('message', (_channel: string, message: string) => {
    try {
      const payload = JSON.parse(message);
      io.of('/chat').to(CHAT_ROOM).emit('chat', payload);
    } catch (e) {
      logger.error(`Chat Redis message parse error: ${e}`, { service: 'chatSocket' });
    }
  });
}

export function setupChatSocket(io: Server) {
  startChatRedisSubscriber(io);

  const chatNamespace = io.of('/chat');

  // Authenticate every chat connection from the session cookie in the handshake.
  // Identity is derived server-side; client-supplied identity is never trusted.
  chatNamespace.use(async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(socket.handshake.headers),
      });

      if (!session?.user) {
        return next(new Error('Unauthorized'));
      }

      const sessionUser = session.user as {
        id: string;
        name?: string | null;
        username?: string | null;
        displayUsername?: string | null;
        image?: string | null;
        role?: string | null;
        banned?: boolean | null;
        banReason?: string | null;
        banExpires?: Date | string | null;
      };

      if (isUserBanned(sessionUser)) {
        return next(new Error('Forbidden'));
      }

      socket.data.authUser = {
        id: sessionUser.id,
        name: sessionUser.displayUsername || sessionUser.name || sessionUser.username || 'User',
        username: sessionUser.username ?? null,
        displayUsername: sessionUser.displayUsername ?? null,
        image: sessionUser.image ?? null,
        role: sessionUser.role === 'admin' ? 'admin' : 'user',
      } satisfies ChatPresenceUser;

      next();
    } catch (err) {
      logger.error(`Chat socket auth error: ${err}`, { service: 'chatSocket' });
      next(new Error('Unauthorized'));
    }
  });

  chatNamespace.on('connection', (socket: Socket) => {
    const authUser = socket.data.authUser as ChatPresenceUser | undefined;
    if (!authUser) {
      socket.disconnect(true);
      return;
    }

    socket.join(CHAT_ROOM);
    socket.data.userId = authUser.id;
    logger.debug(`Chat client connected: ${socket.id} (user ${authUser.id})`, { service: 'chatSocket' });

    // Register presence using the authenticated identity only.
    addPresence(authUser);
    broadcastPresence(chatNamespace);

    socket.on('disconnect', () => {
      const userId = socket.data.userId as string | undefined;
      if (userId) removePresence(userId);
      broadcastPresence(chatNamespace);
      socket.leave(CHAT_ROOM);
    });
  });
}
