"use client";

import { useState, useRef, useEffect } from "react";
import { ThumbsUp, ThumbsDown, Bold, Italic, Code, Star } from "lucide-react";
import { formatDate, formatToStars } from "@/lib/utils";
import { useUser } from "@/providers/UserProvider";
import { toast } from "react-toastify";
import { fetchReviews, postReview, updateReview, deleteReview, voteReview} from "@/services/reviewService";

function renderInline(line: string, keyOffset: number): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*(.*?)\*\*|\*(.*?)\*|`(.*?)`)/g; 
    
    let last = 0;
    let match: RegExpExecArray | null;
    let key = keyOffset;

    while ((match = regex.exec(line)) !== null) {
        if (match.index > last) {
            parts.push(line.slice(last, match.index));
        }

        // match[2] = Bold (** content **)
        // match[3] = Italic (* content *)
        // match[4] = Code (` content `)
        if (match[2] !== undefined) {
            parts.push(<strong key={key++}>{match[2]}</strong>);
        } else if (match[3] !== undefined) {
            parts.push(<em key={key++}>{match[3]}</em>);
        } else if (match[4] !== undefined) {
            parts.push(
                <code key={key++} className="bg-background rounded px-1 py-0.5 text-sm font-mono text-primary">
                    {match[4]}
                </code>
            );
        }
        last = regex.lastIndex;
    }

    if (last < line.length) {
        parts.push(line.slice(last));
    }
    return parts;
}

function MarkdownText({ text }: { text: string }) {
    const lines = text.split('\n');
    const result: React.ReactNode[] = [];
    let key = 0;
    lines.forEach((line, i) => {
        result.push(...renderInline(line, key));
        key += 100;
        if (i < lines.length - 1) result.push(<br key={`br-${i}`} />);
    });
    return <>{result}</>;
}

function insertMarkdown(ref: React.RefObject<HTMLTextAreaElement | null>, setter: (v: string) => void, wrap: [string, string], placeholder: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = el.value.slice(start, end) || placeholder;
    const newVal = `${el.value.slice(0, start)}${wrap[0]}${selected}${wrap[1]}${el.value.slice(end)}`;
    setter(newVal);
    setTimeout(() => {
        el.focus();
        const cursor = start + wrap[0].length + selected.length + wrap[1].length;
        el.setSelectionRange(cursor, cursor);
    }, 0);
}

function MarkdownToolbar({ textRef, setter }: { textRef: React.RefObject<HTMLTextAreaElement | null>, setter: (v: string) => void }) {
    return (
        <div className="flex gap-1 mb-1">
            <button type="button" title="Bold" onClick={() => insertMarkdown(textRef, setter, ['**', '**'], 'bold text')} className="p-1 text-muted hover:text-white hover:bg-foreground/60 bg-background cursor-pointer rounded">
                <Bold className="size-4" />
            </button>
            <button type="button" title="Italic" onClick={() => insertMarkdown(textRef, setter, ['*', '*'], 'italic text')} className="p-1 text-muted hover:text-white hover:bg-foreground/60 bg-background cursor-pointer rounded">
                <Italic className="size-4" />
            </button>
            <button type="button" title="Inline code" onClick={() => insertMarkdown(textRef, setter, ['`', '`'], 'code')} className="p-1 text-muted hover:text-white hover:bg-foreground/60 bg-background cursor-pointer rounded">
                <Code className="size-4" />
            </button>
        </div>
    );
}

function RatingPicker({ value, onChange }: { value: number, onChange: (v: number) => void }) {
    return (
        <div className="flex items-center gap-1 flex-wrap">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" onClick={() => onChange(n)}
                    className={`w-8 h-8 rounded-md text-sm font-bold transition-colors hover:cursor-pointer ${value === n ? 'bg-primary text-black' : 'bg-background text-muted hover:bg-foreground/30 hover:text-white'}`}>
                    {n}
                </button>
            ))}
        </div>
    );
}

function VoteBar({ votes, reviewId, userId, onVote }: { votes: any[], reviewId: number, userId?: string, onVote: (id: number, type: 'like' | 'dislike') => void }) {
    const myVote  = votes?.find((v: any) => v.userId === userId)?.type;
    const likes   = votes?.filter((v: any) => v.type === 'like').length    ?? 0;
    const dislikes = votes?.filter((v: any) => v.type === 'dislike').length ?? 0;
    return (
        <div className="flex items-center gap-3">
            <button onClick={() => onVote(reviewId, 'like')} className={`inline-flex items-center gap-1 text-sm hover:cursor-pointer transition-colors ${myVote === 'like' ? 'text-green-400' : 'text-muted hover:text-green-400'}`}>
                <ThumbsUp className="size-4" /> {likes}
            </button>
            <button onClick={() => onVote(reviewId, 'dislike')} className={`inline-flex items-center gap-1 text-sm hover:cursor-pointer transition-colors ${myVote === 'dislike' ? 'text-red-400' : 'text-muted hover:text-red-400'}`}>
                <ThumbsDown className="size-4" /> {dislikes}
            </button>
        </div>
    );
}

export default function Reviews({ seriesId }: { seriesId: number }) {
    const { user } = useUser();
    const textRef = useRef<HTMLTextAreaElement>(null);
    const editRef = useRef<HTMLTextAreaElement>(null);

    const [reviews, setReviews]       = useState<any[]>([]);
    const [avgRating, setAvgRating]   = useState<number | null>(null);
    const [loading, setLoading]       = useState(true);

    const [text, setText]             = useState("");
    const [rating, setRating]         = useState(0);
    const [submitting, setSubmitting] = useState(false);

    const [editingId, setEditingId]   = useState<number | null>(null);
    const [editText, setEditText]     = useState("");
    const [editRating, setEditRating] = useState(0);

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

    useEffect(() => { loadReviews(); }, [seriesId]);

    const myReview = reviews.find((r) => r.author?.id === user?.id);

    const handleSubmit = async () => {
        if (!text.trim()) return toast.warning("Please write your review.");
        if (rating === 0)  return toast.warning("Please select a rating (1–10).");
        setSubmitting(true);
        try {
            await postReview({ seriesId, content: text, rating });
            setText("");
            setRating(0);
            await loadReviews();
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to post review.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdate = async (reviewId: number) => {
        if (!editText.trim())  return toast.warning("Review content is required.");
        if (editRating === 0)  return toast.warning("Please select a rating.");
        try {
            await updateReview(reviewId, { content: editText, rating: editRating });
            setEditingId(null);
            await loadReviews();
        } catch (e: any) {
            toast.error("Failed to update review.");
        }
    };

    const handleDelete = async (reviewId: number) => {
        try {
            await deleteReview(reviewId);
            await loadReviews();
        } catch {
            toast.error("Failed to delete review.");
        }
    };

    const handleVote = async (reviewId: number, type: 'like' | 'dislike') => {
        try {
            await voteReview(reviewId, type);
            await loadReviews();
        } catch {
            toast.error("Failed to vote.");
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
                <div className="flex flex-col gap-3 bg-foreground rounded-md p-4">
                    <div className="flex gap-4 items-center w-1/2">
                        <span className="text-3xl font-bold">{avgRating}</span>
                        <div className="flex flex-col text-xl">
                            <div>{formatToStars(avgRating)}</div>
                            <div className="text-muted text-sm">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</div>
                        </div>
                    </div>
                    <div className="flex flex-col w-full md:w-1/2">
                        {Array.from({ length: 10 }, (_, i) => i + 1).reverse().map((n) => {
                            const count = reviews.filter((r) => r.rating === n).length;
                            const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                            return (
                                <div key={n} className="flex items-center gap-2 space-y-1">
                                    <span className="text-sm w-20">{n} star{n !== 1 ? 's' : ''}</span>
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
                <div className="flex flex-col bg-foreground p-5 rounded-md gap-3">
                    <h2 className="text-xl font-bold">Write a Review</h2>
                    <div>
                        <p className="text-sm text-muted mb-2">Your Rating <span className="text-red-400">*</span></p>
                        <RatingPicker value={rating} onChange={setRating} />
                    </div>
                    <div>
                        <MarkdownToolbar textRef={textRef} setter={setText} />
                        <textarea ref={textRef} value={text} onChange={(e) => setText(e.target.value)}
                            className="w-full h-28 p-2 bg-background text-white rounded-md resize-none mt-2"
                            placeholder="Share your thoughts about this series..." />
                    </div>
                    <div className="flex justify-end">
                        <button onClick={handleSubmit} disabled={submitting}
                            className="bg-background text-primary px-4 py-2 rounded-md hover:bg-background/50 hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                            Submit Review
                        </button>
                    </div>
                </div>
            )}

            {user && myReview && editingId !== myReview.id && (
                <p className="text-sm text-muted bg-foreground p-3 rounded-md">
                    You have already reviewed this series.
                    <button onClick={() => startEdit(myReview)} className="ml-2 text-primary underline hover:cursor-pointer">Edit your review</button>
                </p>
            )}

            {loading ? (
                <p className="text-muted text-sm">Loading reviews…</p>
            ) : reviews.length === 0 ? (
                <p className="text-muted text-sm">No reviews yet. Be the first!</p>
            ) : (
                <div className="flex flex-col gap-4">
                    {reviews.map((review) => (
                        <div key={review.id} className="relative flex flex-col p-5 bg-foreground rounded-md gap-3">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <img src={review.author?.image || "/default-avatar.jpg"} alt="Avatar" width={44} height={44} className="rounded-full" />
                                    <div>
                                        <h3 className={`font-semibold ${review.author?.role === 'Admin' ? 'text-teal-600' : ''}`}>{review.author?.name}</h3>
                                        <span className="text-xs text-muted">{formatDate(review.createdAt)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 bg-background rounded-md px-3 py-1">
                                    <Star className="size-4 text-primary fill-primary" />
                                    <span className="font-bold text-primary">{review.rating}</span>
                                    <span className="text-muted text-xs">/ 10</span>
                                </div>
                            </div>

                            {editingId === review.id ? (
                                <div className="flex flex-col gap-2">
                                    <RatingPicker value={editRating} onChange={setEditRating} />
                                    <MarkdownToolbar textRef={editRef} setter={setEditText} />
                                    <textarea ref={editRef} value={editText} onChange={(e) => setEditText(e.target.value)}
                                        className="w-full h-24 p-2 bg-background text-white rounded-md resize-none text-sm" />
                                    <div className="flex gap-2 justify-end">
                                        <button onClick={() => setEditingId(null)} className="text-sm text-muted hover:underline">Cancel</button>
                                        <button onClick={() => handleUpdate(review.id)} className="bg-background text-primary px-3 py-1 rounded-md text-sm hover:cursor-pointer">Save</button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-gray-200 whitespace-pre-wrap"><MarkdownText text={review.content} /></p>
                            )}

                            <div className="flex items-center justify-between">
                                <VoteBar votes={review.votes} reviewId={review.id} userId={user?.id} onVote={handleVote} />
                                {review.author?.id === user?.id && editingId !== review.id && (
                                    <div className="flex gap-2">
                                        <button onClick={() => startEdit(review)} className="text-sm text-primary bg-background px-3 py-1 rounded-md hover:bg-background/50 hover:cursor-pointer">Edit</button>
                                        <button onClick={() => handleDelete(review.id)} className="text-sm text-primary bg-background px-3 py-1 rounded-md hover:bg-background/50 hover:cursor-pointer">Delete</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
