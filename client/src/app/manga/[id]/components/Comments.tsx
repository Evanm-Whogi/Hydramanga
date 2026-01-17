"use client";

import Image from "next/image"
import { ThumbsUpIcon, MessageSquare, ChevronDown, ChevronUp, Star } from "lucide-react"
import { formatDate, ratingToStars } from "@/lib/utils"
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postComment, likeComment, deleteComment } from "@/services/commentService";
import { toast } from "react-toastify";
import { useUser } from "@/providers/UserProvider";

export default function Comments({ manga, comments }: { manga: any, comments: any[] }) {
    const [text, setText] = useState("");
    const [rating, setRating] = useState(0); // New state for rating
    const [hoverRating, setHoverRating] = useState(0); // For hover effect
    const [replyText, setReplyText] = useState("");
    const [replyingTo, setReplyingTo] = useState<number | null>(null);
    const [expandedComments, setExpandedComments] = useState<number[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();
    const { user } = useUser();

    const toggleExpand = (commentId: number) => {
        setExpandedComments(prev => prev.includes(commentId) ? prev.filter(id => id !== commentId) : [...prev, commentId]);
    };

    const handleSubmit = async (content: string, parentId: number | null = null) => {
        if (!content.trim()) return;
        // Require rating only for top-level comments (optional logic)
        if (!parentId && rating === 0) return toast.warning("Please select a rating!");
        
        setIsSubmitting(true);
        try {
            // Note: replies usually don't need stars, so we pass 0 or null for them
            await postComment({ seriesId: manga.id, content, stars: parentId ? 0 : rating, parentId, isSpoiler: false });
            setText("");
            setRating(0);
            setReplyText("");
            setReplyingTo(null);
            if (parentId) setExpandedComments(prev => [...prev, parentId]);
            router.refresh();
        } catch (error) {
            toast.error("Failed to post.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLike = async (commentId: number) => {
        try {
            await likeComment(commentId);
            router.refresh();
        } catch (error) {
            toast.error("Failed to like.");
        }
    };

    const handleDelete = async (commentId: number) => {
        try {
            await deleteComment(commentId);
            router.refresh();
        } catch (error) {
            toast.error("Failed to delete.");
        }
    }

    return (
        <>
            <div className="flex flex-col w-full bg-foreground p-5 rounded-md mb-5">
                <h1 className="text-2xl font-bold mb-2">Leave a Comment</h1>
                
                {/* Star Selection Row */}
                <div className="flex items-center gap-1 mb-4">
                    <span className="text-sm text-muted mr-2">Your Rating:</span>
                    {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} onClick={() => setRating(star)} onMouseEnter={() => setHoverRating(star)} onMouseLeave={() => setHoverRating(0)} className="hover:cursor-pointer transition-transform hover:scale-110">
                            <Star className={`size-6 ${(hoverRating || rating) >= star ? "fill-primary text-primary" : "text-muted"}`} />
                        </button>
                    ))}
                    {rating > 0 && <span className="ml-2 text-primary font-bold">{rating}/5</span>}
                </div>

                <textarea value={text} onChange={(e) => setText(e.target.value)} className="w-full h-24 p-2 bg-background text-white rounded-md resize-none" placeholder="Write your comment here..."></textarea>
                <div className="flex justify-end">
                    <button onClick={() => handleSubmit(text)} disabled={isSubmitting} className="bg-primary text-black px-4 py-2 mt-4 rounded-md hover:bg-primary/80 hover:cursor-pointer disabled:opacity-50">Submit</button>
                </div>
            </div>

            <div className="flex flex-col gap-4">
                {comments && comments.map((comment) => (
                    <div key={comment.id} className="flex flex-col gap-2">
                        <div className="relative flex flex-col p-5 bg-foreground hover:bg-foreground/50 rounded-md">
                            <div className="flex justify-between mb-3 items-center">
                                <div className="flex items-center">
                                    <Image src={comment.author.image || "/default-avatar.jpg"} alt="Avatar" width={52} height={52} className="rounded-full" />
                                    <div className="ml-3">
                                        <h2 className={`text-xl font-semibold ${comment.author.role === "Admin" ? "text-teal-600" : ""}`}>{comment.author.name}</h2>
                                        <h3 className="text-sm text-muted">{formatDate(comment.createdAt)}</h3>
                                    </div>
                                </div>
                                {/* Displaying the saved rating */}
                                <span className="text-primary text-2xl absolute top-0 right-0 p-2">{ratingToStars(comment.stars)}</span>
                            </div>
                            <p className="text-gray-200">{comment.content}</p>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-4 mt-2">
                                    <button onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)} className="text-sm text-muted hover:underline inline-flex items-center gap-1 hover:cursor-pointer"><MessageSquare className="size-5" /> Reply</button>
                                    <button onClick={() => handleLike(comment.id)} className={`text-sm inline-flex items-center gap-1 hover:cursor-pointer ${comment.likes?.some((l: any) => l.userId === user?.id) ? "text-yellow-400" : "text-muted hover:underline"}`}><ThumbsUpIcon className="size-4" /> {comment.likes?.length || 0}</button>
                                    
                                    {comment.replies?.length > 0 && (
                                        <button onClick={() => toggleExpand(comment.id)} className="text-sm text-primary hover:underline inline-flex items-center gap-1 hover:cursor-pointer font-medium">
                                            {expandedComments.includes(comment.id) ? <><ChevronUp className="size-4" /> Hide Replies</> : <><ChevronDown className="size-4" /> Show Replies ({comment.replies.length})</>}
                                        </button>
                                    )}
                                </div>
                                { comment.author.id === user?.id && <button onClick={() => handleDelete(comment.id)} className="text-primary absolute bottom-0 right-0 p-2 px-2 py-1 bg-background m-2 hover:cursor-pointer">Delete</button>}
                                 
                            </div>
                        </div>

                        {replyingTo === comment.id && (
                            <div className="ml-10 flex flex-col gap-2 p-4 bg-background rounded-md border border-foreground">
                                <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} className="w-full h-20 p-2 bg-foreground text-white rounded-md resize-none text-sm" placeholder="Write a reply..."></textarea>
                                <div className="flex justify-end gap-2">
                                    <button onClick={() => setReplyingTo(null)} className="text-sm text-muted hover:underline">Cancel</button>
                                    <button onClick={() => handleSubmit(replyText, comment.id)} disabled={isSubmitting} className="bg-primary text-black px-3 py-1 rounded-md text-sm hover:cursor-pointer">Post Reply</button>
                                </div>
                            </div>
                        )}

                        {expandedComments.includes(comment.id) && comment.replies?.length > 0 && (
                            <div className="ml-10 flex flex-col gap-3 border-l-2 border-foreground/30 pl-4 mt-1">
                                {comment.replies.map((reply: any) => (
                                    <div key={reply.id} className="relative flex flex-col p-4 bg-foreground rounded-md">
                                        <div className="flex items-center mb-2">
                                            <Image src={reply.author.image || "/default-avatar.jpg"} alt="Avatar" width={32} height={32} className="rounded-full" />
                                            <div className="ml-2">
                                                <h4 className="text-md font-semibold">{reply.author.name}</h4>
                                                <span className="text-xs text-muted">{formatDate(reply.createdAt)}</span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-300">{reply.content}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </>
    )
}