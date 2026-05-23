"use client";

import MarkdownBlock from "./MarkdownBlock";

const proseClass =
  "prose prose-sm prose-invert max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-2 prose-ol:my-2 prose-li:my-0 prose-pre:bg-foreground prose-pre:border prose-pre:border-borders prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:my-3 prose-code:bg-foreground/80 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none";

export default function MarkdownView({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={`${proseClass} ${className}`.trim()}>
      <MarkdownBlock content={content} />
    </div>
  );
}
