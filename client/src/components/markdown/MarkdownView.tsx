"use client";

import MarkdownBlock from "./MarkdownBlock";

const proseClass =
  "prose prose-sm prose-invert max-w-none min-w-0 break-words overflow-x-hidden dark:prose-invert prose-p:my-1 prose-ul:my-2 prose-ol:my-2 prose-li:my-0 prose-pre:bg-foreground prose-pre:border prose-pre:border-borders prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:my-3 prose-code:bg-foreground/80 prose-code:px-1 prose-code:rounded prose-code:break-all prose-a:break-all prose-img:my-2 prose-img:max-h-80 prose-img:rounded-md prose-code:before:content-none prose-code:after:content-none";

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
