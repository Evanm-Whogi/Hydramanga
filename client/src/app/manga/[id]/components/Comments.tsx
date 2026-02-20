"use client";

import { ThumbsUp, ThumbsDown, MessageSquare, ChevronDown, ChevronUp, Bold, Italic, Code } from "lucide-react"
import { formatTimeAgo } from "@/lib/utils"
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { postComment, voteComment, deleteComment } from "@/services/commentService";
import { toast } from "react-toastify";
import { useUser } from "@/providers/UserProvider";
import { trackCommentAction } from "@/lib/analytics";

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
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const newVal = `${before}${wrap[0]}${selected}${wrap[1]}${after}`;
    setter(newVal);
    setTimeout(() => {
        el.focus();
        const cursor = before.length + wrap[0].length + selected.length + wrap[1].length;
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

function VoteBar({ votes, itemId, userId, onVote }: { votes: any[], itemId: number, userId?: string, onVote: (id: number, type: 'like' | 'dislike') => void }) {
    const myVote = votes?.find((v: any) => v.userId === userId)?.type;
    const likes    = votes?.filter((v: any) => v.type === 'like').length    ?? 0;
    const dislikes = votes?.filter((v: any) => v.type === 'dislike').length ?? 0;
    return (
        <div className="flex items-center gap-3">
            <button onClick={() => onVote(itemId, 'like')} className={`inline-flex items-center gap-1 text-sm hover:cursor-pointer transition-colors ${myVote === 'like' ? 'text-green-400' : 'text-muted hover:text-green-400'}`}>
                <ThumbsUp className="size-4" /> {likes}
            </button>
            <button onClick={() => onVote(itemId, 'dislike')} className={`inline-flex items-center gap-1 text-sm hover:cursor-pointer transition-colors ${myVote === 'dislike' ? 'text-red-400' : 'text-muted hover:text-red-400'}`}>
                <ThumbsDown className="size-4" /> {dislikes}
            </button>
        </div>
    );
}

export default function Comments({ manga, comments }: { manga: any, comments: any[] }) {
    const [text, setText] = useState("");
    const [replyText, setReplyText] = useState("");
    const [replyingTo, setReplyingTo] = useState<number | null>(null);
    const [expandedComments, setExpandedComments] = useState<number[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const textRef = useRef<HTMLTextAreaElement>(null);
    const replyRef = useRef<HTMLTextAreaElement>(null);
    const router = useRouter();
    const { user } = useUser();

    const toggleExpand = (id: number) => setExpandedComments(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

    const handleSubmit = async (content: string, parentId: number | null = null) => {
        if (!content.trim() || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const result = await postComment({ seriesId: manga.id, content, parentId, isSpoiler: false });
            trackCommentAction('posted', result?.comment?.id?.toString(), manga.id.toString(), manga.title, content);
            setText("");
            setReplyText("");
            setReplyingTo(null);
            if (parentId) setExpandedComments(prev => [...prev, parentId]);
            router.refresh();
        } catch {
            toast.error("Failed to post.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleVote = async (commentId: number, type: 'like' | 'dislike') => {
        try {
            await voteComment(commentId, type);
            router.refresh();
        } catch {
            toast.error("Failed to vote.");
        }
    };

    const handleDelete = async (commentId: number, commentText: string) => {
        try {
            await deleteComment(commentId);
            trackCommentAction('deleted', commentId.toString(), manga.id.toString(), manga.title, commentText);
            router.refresh();
        } catch {
            toast.error("Failed to delete.");
        }
    };

    return (
        <>
            <div className="flex flex-col w-full bg-foreground p-5 rounded-md mb-5">
                <h1 className="text-2xl font-bold mb-3">Leave a Comment</h1>
                <MarkdownToolbar textRef={textRef} setter={setText} />
                <textarea ref={textRef} value={text} onChange={(e) => setText(e.target.value)}
                    className="w-full h-24 p-2 bg-background text-white rounded-md resize-none mt-2"
                    placeholder="Write your comment here..." />
                <div className="flex justify-end">
                    <button onClick={() => handleSubmit(text)} disabled={isSubmitting}
                        className="bg-background text-primary px-4 py-2 mt-4 rounded-md hover:bg-background/50 hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                        Submit
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-4">
                {comments && comments.map((comment) => (
                    <div key={comment.id} className="flex flex-col gap-2">
                        <div className="relative flex flex-col p-5 bg-foreground hover:bg-foreground/50 rounded-md">
                            <div className="flex items-center mb-3">
                                <img src={comment.author.image || "/default-avatar.jpg"} alt="Avatar" width={48} height={48} className="rounded-full" />
                                <div className="ml-3">
                                    <h2 className={`text-lg font-semibold ${comment.author.role === "Admin" ? "text-teal-600" : ""}`}>{comment.author.name}</h2>
                                    <span className="text-xs text-muted">{formatTimeAgo(comment.createdAt)}</span>
                                </div>
                            </div>
                            <p className="text-gray-200 mb-3 whitespace-pre-wrap"><MarkdownText text={comment.content} /></p>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                                        className="text-sm text-muted hover:underline inline-flex items-center gap-1 hover:cursor-pointer">
                                        <MessageSquare className="size-4" /> Reply
                                    </button>
                                    <VoteBar votes={comment.votes} itemId={comment.id} userId={user?.id} onVote={handleVote} />
                                    {comment.replies?.length > 0 && (
                                        <button onClick={() => toggleExpand(comment.id)}
                                            className="text-sm text-primary hover:underline inline-flex items-center gap-1 hover:cursor-pointer font-medium">
                                            {expandedComments.includes(comment.id)
                                                ? <><ChevronUp className="size-4" /> Hide Replies</>
                                                : <><ChevronDown className="size-4" /> Show Replies ({comment.replies.length})</>}
                                        </button>
                                    )}
                                </div>
                                {comment.author.id === user?.id && (
                                    <button onClick={() => handleDelete(comment.id, comment.content)}
                                        className="text-primary absolute bottom-0 right-0 p-2 px-2 py-1 bg-background m-2 hover:cursor-pointer text-sm">
                                        Delete
                                    </button>
                                )}
                            </div>
                        </div>

                        {replyingTo === comment.id && (
                            <div className="ml-10 flex flex-col gap-2 p-4 bg-foreground rounded-md border border-foreground">
                                <MarkdownToolbar textRef={replyRef} setter={setReplyText} />
                                <textarea ref={replyRef} value={replyText} onChange={(e) => setReplyText(e.target.value)}
                                    className="w-full h-20 p-2 bg-background text-white rounded-md resize-none text-sm"
                                    placeholder="Write a reply..." />
                                <div className="flex justify-end gap-2 mt-2">
                                    <button onClick={() => setReplyingTo(null)} className="text-sm text-muted bg-background hover:bg-background/50 px-3 py-2 rounded-md cursor-pointer">Cancel</button>
                                    <button onClick={() => handleSubmit(replyText, comment.id)} disabled={isSubmitting} className="bg-background text-primary hover:bg-background/50 px-3 py-2 rounded-md text-sm hover:cursor-pointer">Post Reply</button>
                                </div>
                            </div>
                        )}

                        {expandedComments.includes(comment.id) && comment.replies?.length > 0 && (
                            <div className="ml-10 flex flex-col gap-3 border-l-2 border-foreground/30 pl-4 mt-1">
                                {comment.replies.map((reply: any) => (
                                    <div key={reply.id} className="relative flex flex-col p-4 bg-foreground rounded-md">
                                        <div className="flex items-center mb-2">
                                            <img src={reply.author.image || "/default-avatar.jpg"} alt="Avatar" width={32} height={32} className="rounded-full" />
                                            <div className="ml-2">
                                                <h4 className={`text-sm font-semibold ${reply.author.role === "Admin" ? "text-teal-600" : ""}`}>{reply.author.name}</h4>
                                                <span className="text-xs text-muted">{formatTimeAgo(reply.createdAt)}</span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-300 mb-2 whitespace-pre-wrap"><MarkdownText text={reply.content} /></p>
                                        <div className="flex justify-between items-center">
                                            <VoteBar votes={reply.votes} itemId={reply.id} userId={user?.id} onVote={handleVote} />
                                            {reply.author.id === user?.id && (
                                                <button onClick={() => handleDelete(reply.id, reply.content)}
                                                    className="text-primary text-xs px-2 py-1 bg-background rounded-md hover:bg-background/60 hover:cursor-pointer">
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </>
    );
}
