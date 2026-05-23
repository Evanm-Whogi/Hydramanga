import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq, and, avg, count } from 'drizzle-orm';
import { karmaService } from '@/services/karmaService';
import { enrichAuthors } from '@/lib/enrichAuthors';
import { isAdminRole } from '@/lib/authHelpers';

export async function fetchReviews(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const seriesId = parseInt(req.query.seriesId as string, 10);
    if (isNaN(seriesId)) return res.status(400).json({ message: 'Invalid seriesId parameter' });

    try {
        const reviews = await db.query.reviews.findMany({
            where: (r, { eq }) => eq(r.seriesId, seriesId),
            with: {
                author: { columns: { id: true, name: true, image: true, role: true } },
                votes: true,
            },
            orderBy: (r, { desc }) => [desc(r.createdAt)],
        });

        // Compute average rating
        const ratings = reviews.map((r) => r.rating);
        const avgRating = ratings.length
            ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
            : null;

        const enriched = await enrichAuthors(reviews);
        return res.status(200).json({ reviews: enriched, avgRating, total: enriched.length });
    } catch (error) {
        return next(error);
    }
}

export async function createReview(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const { content, seriesId, rating } = req.body;
    const userId = req.user.id;

    if (!content?.trim()) return res.status(400).json({ message: 'Content is required' });
    if (!seriesId)        return res.status(400).json({ message: 'seriesId is required' });
    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 10)
        return res.status(400).json({ message: 'Rating must be a number between 1 and 10' });

    try {
        // Enforce one review per user per series
        const existing = await db.query.reviews.findFirst({
            where: (r, { eq, and }) => and(eq(r.userId, userId), eq(r.seriesId, seriesId)),
        });
        if (existing) return res.status(409).json({ message: 'You have already reviewed this series' });

        const [review] = await db.insert(schema.reviews).values({
            content: content.trim(),
            rating: ratingNum,
            userId,
            seriesId,
        }).returning();

        await karmaService.award({
            userId,
            action: 'review',
            sourceType: 'review',
            sourceId: String(review.id),
            idempotencyKey: `review:${review.id}`,
        });

        return res.status(201).json({ review });
    } catch (error) {
        return next(error);
    }
}

export async function updateReview(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const reviewId = parseInt(req.params.reviewId, 10);
    const { content, rating } = req.body;
    const userId = req.user.id;

    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 10)
        return res.status(400).json({ message: 'Rating must be a number between 1 and 10' });

    try {
        const existing = await db.query.reviews.findFirst({
            where: (r, { eq, and }) => and(eq(r.id, reviewId), eq(r.userId, userId)),
        });
        if (!existing) return res.status(403).json({ message: 'Review not found or not yours' });

        const [updated] = await db.update(schema.reviews)
            .set({ content: content?.trim() ?? existing.content, rating: ratingNum, updatedAt: new Date() })
            .where(eq(schema.reviews.id, reviewId))
            .returning();

        return res.status(200).json({ review: updated });
    } catch (error) {
        return next(error);
    }
}

export async function deleteReview(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const reviewId = parseInt(req.params.reviewId, 10);
    const userId = req.user.id;

    try {
        const existing = await db.query.reviews.findFirst({
            where: (r, { eq }) => eq(r.id, reviewId),
        });
        if (!existing) return res.status(404).json({ message: 'Review not found' });
        if (!isAdminRole(req.user.role) && existing.userId !== userId) {
            return res.status(403).json({ message: 'Review not found or not yours' });
        }

        await db.delete(schema.reviews).where(eq(schema.reviews.id, reviewId));

        await karmaService.reverse({
            userId: existing.userId,
            action: 'review',
            sourceType: 'review',
            sourceId: String(reviewId),
            originalIdempotencyKey: `review:${reviewId}`,
        });

        return res.status(200).json({ message: 'Review deleted' });
    } catch (error) {
        return next(error);
    }
}

export async function voteReview(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const reviewId = parseInt(req.params.reviewId, 10);
    const { type } = req.body; // 'like' | 'dislike'
    const userId = req.user.id;

    if (type !== 'like' && type !== 'dislike')
        return res.status(400).json({ message: 'type must be "like" or "dislike"' });

    try {
        const existing = await db.query.reviewVotes.findFirst({
            where: (rv, { eq, and }) => and(eq(rv.reviewId, reviewId), eq(rv.userId, userId)),
        });

        if (!existing) {
            await db.insert(schema.reviewVotes).values({ reviewId, userId, type });
            return res.status(201).json({ message: `Review ${type}d` });
        }

        if (existing.type === type) {
            await db.delete(schema.reviewVotes).where(
                and(eq(schema.reviewVotes.reviewId, reviewId), eq(schema.reviewVotes.userId, userId))
            );
            return res.status(200).json({ message: `Review un-${type}d` });
        }

        await db.update(schema.reviewVotes)
            .set({ type })
            .where(and(eq(schema.reviewVotes.reviewId, reviewId), eq(schema.reviewVotes.userId, userId)));
        return res.status(200).json({ message: `Vote switched to ${type}` });
    } catch (error) {
        return next(error);
    }
}
