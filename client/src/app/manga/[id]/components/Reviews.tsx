"use client";

import { useState, useEffect } from "react";
import { Star } from "lucide-react";
import { formatToStars } from "@/lib/utils";
import { useUser } from "@/providers/UserProvider";
import { toast } from "react-toastify";
import { fetchReviews, postReview, updateReview, deleteReview, voteReview } from "@/services/reviewService";
import ContentComposer from "@/components/content/ContentComposer";
import SocialPostCard from "@/components/social/SocialPostCard";
import ContentOverflowMenu from "@/components/social/ContentOverflowMenu";
import { requireTrimmed } from "@/lib/requireContent";
import { useSubmitRateLimit } from "@/hooks/useSubmitRateLimit";
import { toastApiError } from "@/lib/rateLimit";
import { isAdminUser } from "@/lib/contentMenu";
import { requireAuth } from "@/lib/requireAuth";
import { CONTENT_LIMITS } from "@/lib/contentLimits";

function RatingPicker({value, onChange, disabled = false}: {
    value: number;
    onChange: (v: number) => void;
    disabled?: boolean;
}) {
    return (
        <div className="flex items-center gap-1 flex-wrap">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                    key={n}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(n)}
                    className={`w-8 h-8 rounded-md text-sm font-bold transition-colors hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${value === n ? "bg-primary text-black" : "bg-background text-muted hover:bg-foreground/30 hover:text-white"}`}
                >
                    {n}
                </button>
            ))}
        </div>
    );
}

function RatingField({value, onChange, disabled = false}: {
    value: number;
    onChange: (v: number) => void;
    disabled?: boolean;
}) {
    return (
        <div>
            <p className="text-sm text-muted mb-2">
                Your Rating <span className="text-red-400">*</span>
            </p>
            <RatingPicker value={value} onChange={onChange} disabled={disabled} />
        </div>
    );
}

function ReviewRatingBadge({ rating }: { rating: number }) {
    return (
        <div className="flex items-center gap-2 bg-background rounded-md px-3 py-1">
            <Star className="size-4 text-primary fill-primary" />
            <span className="font-bold text-primary">{rating}</span>
            <span className="text-muted text-xs">/ 10</span>
        </div>
    );
}

export default function Reviews({ seriesId }: { seriesId: number }) {
    const { user } = useUser();

    const [reviews, setReviews] = useState<any[]>([]);
    const [avgRating, setAvgRating] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    const [text, setText] = useState("");
    const [rating, setRating] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editText, setEditText] = useState("");
    const [editRating, setEditRating] = useState(0);
    const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

    const loadReviews = async () => {
        try {
            const data = await fetchReviews(seriesId);
            setReviews(data?.reviews ?? []);
            setAvgRating(data?.avgRating ?? null);
        } catch {
            toast.error("Failed to load reviews.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReviews();
    }, [seriesId]);

    const myReview = reviews.find((r) => r.author?.id === user?.id);
    const isAdmin = isAdminUser(user?.role);
    const {isRateLimited: isReviewRateLimited, applyRateLimitFromError: applyReviewRateLimit, rateLimitSecondsLeft: reviewRateLimitSecondsLeft} = useSubmitRateLimit();
    const reviewRateHint = isReviewRateLimited
        ? `Please wait ${reviewRateLimitSecondsLeft}s before submitting another review.`
        : undefined;

    const handleSubmit = async () => {
        if (!requireAuth(user, `/manga/${seriesId}`)) return;
        if (isReviewRateLimited) return;
        if (!requireTrimmed(text, "Please write your review.")) return;
        if (rating === 0) {
            toast.warning("Please select a rating (1–10).");
            return;
        }
        setSubmitting(true);
        try {
            await postReview({ seriesId, content: text, rating });
            setText("");
            setRating(0);
            toast.success("Review posted");
            await loadReviews();
        } catch (e: unknown) {
            if (!applyReviewRateLimit(e)) {
                toastApiError(e, "Failed to post review.");
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdate = async (reviewId: number) => {
        if (!requireTrimmed(editText, "Review content is required.")) return;
        if (editRating === 0) {
            toast.warning("Please select a rating.");
            return;
        }
        try {
            await updateReview(reviewId, { content: editText, rating: editRating });
            setEditingId(null);
            toast.success("Review updated");
            await loadReviews();
        } catch (err: unknown) {
            toastApiError(err, "Failed to update review.");
        }
    };

    const handleDelete = async (reviewId: number) => {
        try {
            await deleteReview(reviewId);
            await loadReviews();
        } catch (err: unknown) {
            toastApiError(err, "Failed to delete review.");
        }
    };

    const handleVote = async (reviewId: number, type: "like" | "dislike") => {
        if (!requireAuth(user, `/manga/${seriesId}`)) return;
        try {
            await voteReview(reviewId, type);
            await loadReviews();
        } catch (err: unknown) {
            toastApiError(err, "Failed to vote.");
        }
    };

    const startEdit = (review: any) => {
        setEditingId(review.id);
        setEditText(review.content);
        setEditRating(review.rating);
    };

    return (
        <div className="flex flex-col gap-5">
            {avgRating !== null && (
                <div className="flex flex-col gap-3 bg-foreground rounded-lg p-4 border border-borders">
                    <div className="flex gap-4 items-center w-1/2">
                        <span className="text-3xl font-bold">{avgRating}</span>
                        <div className="flex flex-col text-xl">
                            <div>{formatToStars(avgRating)}</div>
                            <div className="text-muted text-sm">{reviews.length} review{reviews.length !== 1 ? "s" : ""}</div>
                        </div>
                    </div>
                    <div className="flex flex-col w-full md:w-1/2">
                        {Array.from({ length: 10 }, (_, i) => i + 1)
                            .reverse()
                            .map((n) => {
                                const count = reviews.filter((r) => r.rating === n).length;
                                const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                                return (
                                    <div key={n} className="flex items-center gap-2 space-y-1">
                                        <span className="text-sm w-20">{n} star{n !== 1 ? "s" : ""}</span>
                                        <div className="w-full bg-background rounded h-3">
                                            <div className="bg-accent h-3 rounded" style={{ width: `${percentage}%` }}></div>
                                        </div>
                                        <span className="text-sm text-muted">{count}</span>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            {user && !myReview && (
                <ContentComposer
                    heading="Write a Review"
                    top={<RatingField value={rating} onChange={setRating} disabled={isReviewRateLimited} />}
                    value={text}
                    onChange={setText}
                    placeholder="Share your thoughts…"
                    rows={6}
                    minHeight="min-h-[120px]"
                    maxLength={CONTENT_LIMITS.review}
                    onSubmit={handleSubmit}
                    submitLabel="Post review"
                    submitting={submitting}
                    disabled={submitting}
                    rateLimited={isReviewRateLimited}
                    rateLimitHint={reviewRateHint}
                    layout="card"
                />
            )}

            {user && myReview && editingId !== myReview.id && (
                <p className="text-sm text-muted bg-foreground p-3 rounded-lg border border-borders">
                    You have already reviewed this series.
                    <button onClick={() => startEdit(myReview)} className="ml-2 text-primary underline hover:cursor-pointer">
                        Edit your review
                    </button>
                </p>
            )}

            {loading ? (
                <p className="text-muted text-sm">Loading reviews…</p>
            ) : reviews.length === 0 ? (
                <p className="text-muted text-sm">No reviews yet. Be the first!</p>
            ) : (
                <div className="flex flex-col gap-4">
                    {reviews.map((review) => (
                        <div key={review.id}>
                            {editingId === review.id ? (
                                <div className="bg-foreground rounded-lg p-4 border border-borders space-y-3">
                                    <RatingField value={editRating} onChange={setEditRating} />
                                    <ContentComposer
                                        value={editText}
                                        onChange={setEditText}
                                        placeholder="Edit your review…"
                                        rows={5}
                                        minHeight="min-h-[100px]"
                                        maxLength={CONTENT_LIMITS.review}
                                        onSubmit={() => handleUpdate(review.id)}
                                        submitLabel="Save"
                                        layout="embedded"
                                        onCancel={() => setEditingId(null)}
                                    />
                                </div>
                            ) : (
                                <SocialPostCard
                                    author={review.author}
                                    createdAt={review.createdAt}
                                    content={review.content}
                                    headerRight={<ReviewRatingBadge rating={review.rating} />}
                                    votes={review.votes}
                                    itemId={review.id}
                                    userId={user?.id}
                                    onVote={handleVote}
                                    overflowMenu={
                                        (review.author?.id === user?.id || isAdmin) ? (
                                            <ContentOverflowMenu
                                                open={menuOpenId === review.id}
                                                onOpenChange={(open) => setMenuOpenId(open ? review.id : null)}
                                                isOwner={review.author?.id === user?.id}
                                                isAdmin={isAdmin}
                                                onEdit={
                                                    review.author?.id === user?.id
                                                        ? () => startEdit(review)
                                                        : undefined
                                                }
                                                onDelete={
                                                    review.author?.id === user?.id
                                                        ? () => void handleDelete(review.id)
                                                        : undefined
                                                }
                                                adminItems={
                                                    isAdmin && review.author?.id !== user?.id
                                                        ? [{
                                                              label: "Delete",
                                                              variant: "danger",
                                                              onClick: () => void handleDelete(review.id),
                                                          }]
                                                        : []
                                                }
                                            />
                                        ) : undefined
                                    }
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
