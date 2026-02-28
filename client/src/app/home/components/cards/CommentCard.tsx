import { formatTimeAgo } from "@/lib/utils";
import Link from "next/link";
import MarkdownView from "@/components/markdown/MarkdownView";

export default function CommentCard({ comment }: { comment: any }) {
    return (
        <div className="bg-foreground p-4 rounded-md shadow-md relative">
            <div className="flex items-center mb-2">
                <img src={comment.author.image || "/default-avatar.jpg"} alt={comment.author.name} className="w-10 h-10 rounded-full mr-3" />
                <div>
                    <h3 className="text-lg font-semibold">{comment.author.name}</h3>
                    <p className="text-sm text-muted">{formatTimeAgo(comment.createdAt)}</p>
                </div>
            </div>
            <div className="text-base pb-12 md:pb-6 text-muted">
                <MarkdownView content={comment.content} />
            </div>
            <Link href={`/manga/${comment.series.id}`} className="absolute bottom-0 left-0 p-2 mt-2 text-sm text-primary hover:text-accent">
                <span className="text-muted">On:</span> {comment.series.title}
            </Link>
        </div>
    );
}
