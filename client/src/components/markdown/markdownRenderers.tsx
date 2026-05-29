"use client";

import type { Components } from "react-markdown";
import type { Pluggable } from "unified";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

export const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), "u"],
};

const baseRehypePlugins: Pluggable[] = [
  rehypeRaw,
  [rehypeSanitize, markdownSanitizeSchema],
];

function safeExternalLink(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (href.startsWith('https://') || href.startsWith('http://') || href.startsWith('/')) {
    return href;
  }
  return undefined;
}

/** Block markdown (paragraphs, lists, etc.). */
export const blockMarkdownComponents: Components = {
  a: ({ href, children, ...props }) => {
    const safeHref = safeExternalLink(href);
    return (
      <a
        href={safeHref}
        rel="noopener noreferrer"
        target={safeHref?.startsWith('http') ? '_blank' : undefined}
        {...props}
      >
        {children}
      </a>
    );
  },
};

/** Inline-only: unwrap <p> and other block wrappers so content can live inside <p>. */
export const inlineMarkdownComponents: Components = {
  p: ({ children }) => <>{children}</>,
  div: ({ children }) => <>{children}</>,
  h1: ({ children }) => <strong className="text-lg">{children}</strong>,
  h2: ({ children }) => <strong>{children}</strong>,
  h3: ({ children }) => <strong>{children}</strong>,
  ul: ({ children }) => <span className="inline">{children}</span>,
  ol: ({ children }) => <span className="inline">{children}</span>,
  li: ({ children }) => <span className="inline"> {children}</span>,
  a: ({ href, children, ...props }) => {
    const safeHref = safeExternalLink(href);
    return (
      <a
        href={safeHref}
        className="text-accent hover:underline"
        rel="noopener noreferrer"
        target={safeHref?.startsWith('http') ? '_blank' : undefined}
        {...props}
      >
        {children}
      </a>
    );
  },
};

export function BlockMarkdown({ content }: { content: string }) {
  if (!content) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={baseRehypePlugins}
      components={blockMarkdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
}

export function InlineMarkdown({ content }: { content: string }) {
  if (!content) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={baseRehypePlugins}
      components={inlineMarkdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
}
