"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), "u"],
};

const proseClass =
  "prose prose-sm prose-invert max-w-none dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0 prose-pre:bg-foreground prose-pre:border prose-pre:border-borders prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:my-3 prose-code:bg-foreground/80 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none";

export default function MarkdownView({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={`${proseClass} ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
}
