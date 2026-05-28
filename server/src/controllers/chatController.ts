import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq } from 'drizzle-orm';
import { chatService } from '@/services/chatService';
import { isAdminRole } from '@/lib/authHelpers';
import { recordAuditFromRequest } from '@/audit/record';
import { chatPageHref, contentAuditMeta } from '@/audit/metadataHelpers';

export async function getChatMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const beforeId = req.query.beforeId ? parseInt(req.query.beforeId as string, 10) : undefined;
    const messages = await chatService.getMessages(limit, beforeId);
    return res.json({ messages });
  } catch (error) {
    return next(error);
  }
}

export async function postChatMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { content } = req.body;
    const message = await chatService.createMessage(req.user.id, content);
    recordAuditFromRequest(req, {
      action: 'chat.message.create',
      category: 'community',
      resourceType: 'chat_message',
      resourceId: String(message.id),
      metadata: contentAuditMeta({
        href: chatPageHref(),
        summary: 'Sent a chat message',
        content: typeof content === 'string' ? content : message.content,
      }),
    });
    return res.status(201).json({ message });
  } catch (error: any) {
    if (error.message?.includes('muted') || error.message?.includes('empty')) {
      return res.status(403).json({ message: error.message });
    }
    return next(error);
  }
}

export async function deleteChatMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const messageId = parseInt(req.params.messageId, 10);
    const existing = await db.query.chatMessages.findFirst({
      where: eq(schema.chatMessages.id, messageId),
    });
    await chatService.deleteMessage(messageId, req.user.id, isAdminRole(req.user.role));
    recordAuditFromRequest(req, {
      action: isAdminRole(req.user.role) ? 'chat.message.delete.admin' : 'chat.message.delete',
      category: 'community',
      resourceType: 'chat_message',
      resourceId: String(messageId),
      metadata: contentAuditMeta({
        href: chatPageHref(),
        summary: isAdminRole(req.user.role) ? 'Admin deleted a chat message' : 'Deleted a chat message',
        content: existing?.content,
      }),
    });
    return res.json({ message: 'Deleted' });
  } catch (error: any) {
    if (error.message === 'Message not found') return res.status(404).json({ message: error.message });
    if (error.message === 'Forbidden') return res.status(403).json({ message: error.message });
    return next(error);
  }
}

export async function updateChatMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const messageId = parseInt(req.params.messageId, 10);
    const { content } = req.body;
    const message = await chatService.updateMessage(messageId, req.user.id, content);
    recordAuditFromRequest(req, {
      action: 'chat.message.update',
      category: 'community',
      resourceType: 'chat_message',
      resourceId: String(messageId),
      metadata: contentAuditMeta({
        href: chatPageHref(),
        summary: 'Edited a chat message',
        content: typeof content === 'string' ? content : message.content,
      }),
    });
    return res.json({ message });
  } catch (error: any) {
    if (error.message === 'Message not found') return res.status(404).json({ message: error.message });
    if (error.message === 'Forbidden') return res.status(403).json({ message: error.message });
    if (error.message?.includes('empty')) return res.status(400).json({ message: error.message });
    return next(error);
  }
}

export async function muteChatUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, hours, reason } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });
    await chatService.muteUser(userId, req.user.id, { hours, reason });
    recordAuditFromRequest(req, {
      action: 'chat.user.mute',
      category: 'moderation',
      resourceType: 'user',
      resourceId: userId,
      targetUserId: userId,
      metadata: { hours, reason },
    });
    return res.json({ message: 'User muted' });
  } catch (error) {
    return next(error);
  }
}

export async function unmuteChatUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });
    await chatService.unmuteUser(userId);
    recordAuditFromRequest(req, {
      action: 'chat.user.unmute',
      category: 'moderation',
      resourceType: 'user',
      resourceId: userId,
      targetUserId: userId,
    });
    return res.json({ message: 'User unmuted' });
  } catch (error) {
    return next(error);
  }
}
