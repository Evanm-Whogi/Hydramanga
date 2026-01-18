import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq, or, and, sql, asc, desc, count, gte, inArray, isNotNull, not, isNull  } from 'drizzle-orm';
import dotenv from 'dotenv';
import { auth } from '@/utils/auth';
dotenv.config();

// Fetch comments for a manga series
export async function fetchComments(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const seriesId = parseInt(req.query.seriesId as string, 10);
    if(isNaN(seriesId))  return res.status(400).json({ message: 'Invalid seriesId parameter' });
    
    try {
        const mangaComments = await db.query.comments.findMany({
            where: (comments, { eq, and, isNull }) => and(
                eq(comments.seriesId, seriesId),
                isNull(comments.parentId)
            ),
            with: {
                author: { 
                    columns: { name: true, image: true, id: true, role: true } 
                },
                likes: true, 
                replies: {
                    with: {
                        author: { columns: { name: true, image: true, id: true, role: true } },
                        likes: true,
                    }
                }
            },
            orderBy: (comments, { desc }) => [desc(comments.createdAt)]
        });

        return res.status(200).json({ comments: mangaComments });
    } catch (error) {
        return next(error);
    }
}

// Create a new comment
export async function createComment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const { content, seriesId, parentId, stars, isSpoiler } = req.body;
    const userId = req.user.id;

    try {
        const newComment = await db.insert(schema.comments).values({
            content,
            userId,
            seriesId,
            stars,
            parentId: parentId || null,
            isSpoiler: isSpoiler || false,
        }).returning();

        return res.status(201).json({ comment: newComment[0] });
    } catch (error) {
        return next(error);
    }
}

export async function likeComment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const { commentId } = req.body;
    const userId = req.user.id;

    try {
        // Check if the user has already liked the comment
        const existingLike = await db.query.commentLikes.findFirst({
            where: (cl, { eq }) => and(
                eq(cl.commentId, commentId),
                eq(cl.userId, userId)
            )
        });

        if (existingLike) {
            // If like exists, remove it (unlike)
            await db.delete(schema.commentLikes).where(and(
                eq(schema.commentLikes.commentId, commentId),
                eq(schema.commentLikes.userId, userId)
            ));
            return res.status(200).json({ message: 'Comment unliked' });
        } else {
            // If like doesn't exist, create it
            await db.insert(schema.commentLikes).values({
                commentId,
                userId
            });
            return res.status(201).json({ message: 'Comment liked' });
        }
    } catch (error) {
        return next(error);
    }
}

export async function deleteComment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const commentId = parseInt(req.params.commentId, 10);
    const userId = req.user.id;

    try {
        // Verify that the comment belongs to the user
        const comment = await db.query.comments.findFirst({
            where: (comments, { eq }) => and(
                eq(comments.id, commentId),
                eq(comments.userId, userId)
            )
        });

        if (!comment) return res.status(403).json({ message: 'You do not have permission to delete this comment' });
        
        // Delete the comment
        await db.delete(schema.comments).where(eq(schema.comments.id, commentId));

        return res.status(200).json({ message: 'Comment deleted successfully' });
    } catch (error) {
        return next(error);
    }
}