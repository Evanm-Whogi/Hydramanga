import { formatDate } from '@/lib/utils';
import Link from 'next/link';

export default function CommentCard({ comment }: { comment: any }) {
    return (
        <div className="bg-foreground p-4 rounded-md shadow-md relative">
            <div className="flex items-center mb-2">
                <img src={comment.author.image || '/default-avatar.jpg'} alt={comment.author.name} className="w-10 h-10 rounded-full mr-3" />
                <div>
                    <h3 className="text-lg font-semibold">{comment.author.name}</h3>
                    <p className="text-sm text-muted">{formatDate(comment.createdAt)}</p>
                </div>
            </div>
            <p className="text-base pb-12 md:pb-6">{comment.content}</p>
            <Link href={`/manga/${comment.manga.id}`} className="absolute bottom-0 left-0 p-2 mt-2 text-sm text-primary hover:text-accent"><span className="text-muted">On:</span> {comment.manga.title}</Link>
        </div>
    );
}