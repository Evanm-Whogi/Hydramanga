import Link from "next/link";
import Image from "next/image";
import { formatTimeAgo } from "@/lib/utils";
import MarkdownView from "@/components/markdown/MarkdownView";

export default function SidebarCommentItem({ comment }: { comment: any }) {
  return (
    <article className="px-4 py-3 transition-colors hover:bg-background/40">
      <div className="flex items-center gap-2.5">
        <Image
          src={comment.author?.image || "/media/pfp/default.jpg"}
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0 flex-1">
          <Link href={`/users/${comment.author?.id}`} className="truncate text-sm font-medium text-primary hover:text-accent">{comment.author?.name}</Link>
          <p className="text-xs text-muted">{formatTimeAgo(comment.createdAt)}</p>
        </div>
      </div>
      <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted [&_.prose]:text-xs [&_.prose]:leading-relaxed">
        <MarkdownView content={comment.content} />
      </div>
      <Link href={`/manga/${comment.series?.id}`} className="mt-2 inline-block truncate text-xs text-accent hover:underline">
        {comment.series?.title}
      </Link>
    </article>
  );
}
