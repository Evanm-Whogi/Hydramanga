"use client";

import type { Components } from "react-markdown";
import type { Pluggable } from "unified";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { embedImageUrlsForMarkdown, isAllowedImageUrl } from "@/lib/contentImages";

export const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), "u", "img"],
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img || []), "src", "alt", "loading", "className"],
  },
};

const embeddedImageClass = "max-w-full max-h-64 max-w-64 rounded-md my-2 object-contain";

const imageComponent: Pick<Components, "img"> = {
  img: ({ src, alt, ...props }) => {
    const url = typeof src === "string" ? src : undefined;
    if (!url || !isAllowedImageUrl(url)) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={alt || ""} loading="lazy" className={embeddedImageClass} {...props} />
    );
  },
};

const baseRemarkPlugins: Pluggable[] = [remarkGfm, remarkBreaks];

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
  ...imageComponent,
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
  ...imageComponent,
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
  const prepared = embedImageUrlsForMarkdown(content);
  return (
    <ReactMarkdown
      remarkPlugins={baseRemarkPlugins}
      rehypePlugins={baseRehypePlugins}
      components={blockMarkdownComponents}
    >
      {prepared}
    </ReactMarkdown>
  );
}

export function InlineMarkdown({ content }: { content: string }) {
  if (!content) return null;
  const prepared = embedImageUrlsForMarkdown(content);
  return (
    <ReactMarkdown
      remarkPlugins={baseRemarkPlugins}
      rehypePlugins={baseRehypePlugins}
      components={inlineMarkdownComponents}
    >
      {prepared}
    </ReactMarkdown>
  );
}
