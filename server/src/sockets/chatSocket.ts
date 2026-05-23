import Redis from 'ioredis';
import { Namespace, Server, Socket } from 'socket.io';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { CHAT_CHANNEL, CHAT_ROOM } from '@/services/chatService';

export type ChatPresenceUser = {
  id: string;
  name: string;
  image: string | null;
  role: string;
};

type PresenceEntry = ChatPresenceUser & { connections: number };

const presenceByUserId = new Map<string, PresenceEntry>();

function getPresenceList(): ChatPresenceUser[] {
  return Array.from(presenceByUserId.values()).map(({ id, name, image, role }) => ({
    id,
    name,
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

  chatNamespace.on('connection', (socket: Socket) => {
    socket.join(CHAT_ROOM);
    logger.debug(`Chat client connected: ${socket.id}`, { service: 'chatSocket' });

    socket.on('join', (user: ChatPresenceUser) => {
      if (!user?.id || !user?.name) return;
      socket.data.userId = user.id;
      addPresence({
        id: user.id,
        name: user.name,
        image: user.image ?? null,
        role: user.role ?? 'user',
      });
      broadcastPresence(chatNamespace);
    });

    socket.on('disconnect', () => {
      const userId = socket.data.userId as string | undefined;
      if (userId) removePresence(userId);
      broadcastPresence(chatNamespace);
      socket.leave(CHAT_ROOM);
    });
  });
}
