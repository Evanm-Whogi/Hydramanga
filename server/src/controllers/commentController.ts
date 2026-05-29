import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq, and } from 'drizzle-orm';
import dotenv from 'dotenv';
import { karmaService } from '@/services/karmaService';
import { enrichCommentsWithKarma } from '@/lib/enrichAuthors';
import { isAdminRole } from '@/lib/authHelpers';
import { discordService } from '@/services/discordService';
import { notificationService } from '@/services/notificationService';
import { recordAuditFromRequest } from '@/audit/record';
import { contentAuditMeta, mangaPageHref } from '@/audit/metadataHelpers';
import { CONTENT_LIMITS, exceedsLimit } from '@/lib/securityLimits';
dotenv.config();

// Fetch top-level comments with replies and votes for a manga series
export async function fetchComments(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const seriesId = parseInt(req.query.seriesId as string, 10);
    if (isNaN(seriesId)) return res.status(400).json({ message: 'Invalid seriesId parameter' });

    try {
        const mangaComments = await db.query.comments.findMany({
            where: (comments, { eq, and, isNull }) => and(
                eq(comments.seriesId, seriesId),
                isNull(comments.parentId)
            ),
            with: {
                author: {
                    columns: { name: true, image: true, id: true, role: true, username: true, displayUsername: true }
                },
                votes: true,
                replies: {
                    with: {
                        author: { columns: { name: true, image: true, id: true, role: true, username: true, displayUsername: true } },
                        votes: true,
                    },
                    orderBy: (comments, { asc }) => [asc(comments.createdAt)],
                },
            },
            orderBy: (comments, { desc }) => [desc(comments.createdAt)],
        });

        const enriched = await enrichCommentsWithKarma(mangaComments);
        return res.status(200).json({ comments: enriched });
    } catch (error) {
        return next(error);
    }
}

// Create a new comment (no star rating)
export async function createComment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const { content, seriesId, parentId, isSpoiler } = req.body;
    const userId = req.user.id;

    if (!content?.trim()) return res.status(400).json({ message: 'Content is required' });
    if (exceedsLimit(content, CONTENT_LIMITS.comment)) {
        return res.status(400).json({ message: `Content must be at most ${CONTENT_LIMITS.comment} characters` });
    }
    if (!seriesId)        return res.status(400).json({ message: 'seriesId is required' });

    try {
        const newComment = await db.insert(schema.comments).values({
            content: content.trim(),
            userId,
            seriesId,
            parentId: parentId || null,
            isSpoiler: isSpoiler || false,
        }).returning();

        await karmaService.award({
            userId,
            action: 'comment',
            sourceType: 'comment',
            sourceId: String(newComment[0].id),
            idempotencyKey: `comment:${newComment[0].id}`,
        });

        const [seriesRow] = await db
            .select({ title: schema.series.title })
            .from(schema.series)
            .where(eq(schema.series.id, seriesId))
            .limit(1);

        if (seriesRow?.title) {
            discordService
                .notifyComment(
                    req.user.name || 'Unknown',
                    seriesId,
                    seriesRow.title,
                    content.trim(),
                    newComment[0].id,
                    !!parentId
                )
                .catch(() => undefined);
        }

        if (parentId) {
            const parentComment = await db.query.comments.findFirst({
                where: (comments, { eq }) => eq(comments.id, parentId),
            });
            if (
                parentComment &&
                parentComment.userId !== userId &&
                seriesRow?.title
            ) {
                notificationService
                    .notifyCommentReply({
                        recipientUserId: parentComment.userId,
                        replierName: req.user.name || 'Someone',
                        seriesId,
                        seriesTitle: seriesRow.title,
                    })
                    .catch(() => undefined);
            }
        }

        recordAuditFromRequest(req, {
            action: 'comment.create',
            category: 'social',
            resourceType: 'comment',
            resourceId: String(newComment[0].id),
            metadata: contentAuditMeta({
                href: mangaPageHref(seriesId),
                summary: `Posted a comment${seriesRow?.title ? ` on ${seriesRow.title}` : ''}`,
                content: content.trim(),
                extra: { seriesId, seriesTitle: seriesRow?.title ?? null, parentId: parentId ?? null },
            }),
        });

        return res.status(201).json({ comment: newComment[0] });
    } catch (error) {
        return next(error);
    }
}

/**
 * Vote on a comment (like or dislike).
 * - No existing vote  → insert with the given type
 * - Same type exists  → remove vote (toggle off)
 * - Different type    → switch like↔dislike
 */
export async function voteComment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const { commentId, type } = req.body; // type: 'like' | 'dislike'
    const userId = req.user.id;

    if (!commentId) return res.status(400).json({ message: 'commentId is required' });
    if (type !== 'like' && type !== 'dislike')
        return res.status(400).json({ message: 'type must be "like" or "dislike"' });

    try {
        const existing = await db.query.commentLikes.findFirst({
            where: (cl, { eq, and }) => and(
                eq(cl.commentId, commentId),
                eq(cl.userId, userId)
            ),
        });

        if (!existing) {
            await db.insert(schema.commentLikes).values({ commentId, userId, type });
            recordAuditFromRequest(req, {
                action: 'comment.vote',
                category: 'social',
                resourceType: 'comment',
                resourceId: String(commentId),
                metadata: { voteType: type },
            });
            return res.status(201).json({ message: `Comment ${type}d` });
        }

        if (existing.type === type) {
            // Same type → remove (un-vote)
            await db.delete(schema.commentLikes).where(
                and(
                    eq(schema.commentLikes.commentId, commentId),
                    eq(schema.commentLikes.userId, userId)
                )
            );
            recordAuditFromRequest(req, {
                action: 'comment.vote_remove',
                category: 'social',
                resourceType: 'comment',
                resourceId: String(commentId),
                metadata: { voteType: type },
            });
            return res.status(200).json({ message: `Comment un-${type}d` });
        }

        // Different type → switch
        await db.update(schema.commentLikes)
            .set({ type })
            .where(
                and(
                    eq(schema.commentLikes.commentId, commentId),
                    eq(schema.commentLikes.userId, userId)
                )
            );
        recordAuditFromRequest(req, {
            action: 'comment.vote',
            category: 'social',
            resourceType: 'comment',
            resourceId: String(commentId),
            metadata: { voteType: type, switched: true },
        });
        return res.status(200).json({ message: `Vote switched to ${type}` });
    } catch (error) {
        return next(error);
    }
}

export async function updateComment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const commentId = parseInt(req.params.commentId, 10);
    const { content } = req.body;
    const userId = req.user.id;

    if (!content?.trim()) return res.status(400).json({ message: 'Content is required' });
    if (exceedsLimit(content, CONTENT_LIMITS.comment)) {
        return res.status(400).json({ message: `Content must be at most ${CONTENT_LIMITS.comment} characters` });
    }

    try {
        const comment = await db.query.comments.findFirst({
            where: (comments, { eq }) => eq(comments.id, commentId),
        });

        if (!comment) return res.status(404).json({ message: 'Comment not found' });
        if (comment.userId !== userId) return res.status(403).json({ message: 'You do not have permission to edit this comment' });

        const [updated] = await db
            .update(schema.comments)
            .set({ content: content.trim(), updatedAt: new Date() })
            .where(eq(schema.comments.id, commentId))
            .returning();

        recordAuditFromRequest(req, {
            action: 'comment.update',
            category: 'social',
            resourceType: 'comment',
            resourceId: String(commentId),
            metadata: contentAuditMeta({
                href: mangaPageHref(comment.seriesId),
                summary: 'Edited a comment',
                content: content.trim(),
                extra: { seriesId: comment.seriesId },
            }),
        });

        return res.status(200).json({ comment: updated });
    } catch (error) {
        return next(error);
    }
}

export async function deleteComment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const commentId = parseInt(req.params.commentId, 10);
    const userId = req.user.id;
    const admin = isAdminRole(req.user.role);

    try {
        const comment = await db.query.comments.findFirst({
            where: (comments, { eq }) => eq(comments.id, commentId),
        });

        if (!comment) return res.status(404).json({ message: 'Comment not found' });
        if (!admin && comment.userId !== userId) {
            return res.status(403).json({ message: 'You do not have permission to delete this comment' });
        }
        
        await db.delete(schema.comments).where(eq(schema.comments.id, commentId));

        await karmaService.reverse({
            userId: comment.userId,
            action: 'comment',
            sourceType: 'comment',
            sourceId: String(commentId),
            originalIdempotencyKey: `comment:${commentId}`,
        });

        recordAuditFromRequest(req, {
            action: admin ? 'comment.delete.admin' : 'comment.delete',
            category: 'social',
            resourceType: 'comment',
            resourceId: String(commentId),
            metadata: contentAuditMeta({
                href: mangaPageHref(comment.seriesId),
                summary: admin ? 'Admin deleted a comment' : 'Deleted a comment',
                content: comment.content,
                extra: { seriesId: comment.seriesId, ownerId: comment.userId },
            }),
        });

        return res.status(200).json({ message: 'Comment deleted successfully' });
    } catch (error) {
        return next(error);
    }
}