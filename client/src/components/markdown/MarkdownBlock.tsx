"use client";

import { Fragment } from "react";
import Spoiler from "./Spoiler";
import { BlockMarkdown, InlineMarkdown } from "./markdownRenderers";
import { hasSpoilerSegments, parseSpoilerSegments, type SpoilerSegment } from "./spoilerMarkdown";

function renderInlineParagraph(segments: SpoilerSegment[], key: string) {
  return (
    <p key={key} className="my-1 leading-relaxed">
      {segments.map((seg, i) =>
        seg.type === "spoiler" ? (
          <Spoiler key={`${key}-s-${i}`} inline content={seg.value} />
        ) : (
          <InlineMarkdown key={`${key}-m-${i}`} content={seg.value} />
        )
      )}
    </p>
  );
}

function renderParagraphBlock(para: string, key: string) {
  const segments = parseSpoilerSegments(para);
  if (!hasSpoilerSegments(segments)) {
    return <BlockMarkdown key={key} content={para} />;
  }

  const blockSpoiler = segments.some(
    (s) => s.type === "spoiler" && spoilerNeedsBlock(s.value)
  );

  if (blockSpoiler) {
    return (
      <div key={key} className="space-y-1 my-1">
        {segments.map((seg, i) =>
          seg.type === "spoiler" ? (
            <Spoiler key={`${key}-s-${i}`} content={seg.value} />
          ) : (
            <BlockMarkdown key={`${key}-m-${i}`} content={seg.value} />
          )
        )}
      </div>
    );
  }

  return renderInlineParagraph(segments, key);
}

function spoilerNeedsBlock(value: string): boolean {
  return value.includes("\n") || /^(\s*[-*+]|\s*\d+\.)\s/m.test(value);
}

function renderWithSpoilers(content: string) {
  const paragraphs = content.split(/\n\n+/);

  return paragraphs.map((para, i) => {
    if (!para) return null;
    return <Fragment key={i}>{renderParagraphBlock(para, `p-${i}`)}</Fragment>;
  });
}

export default function MarkdownBlock({content, className = ""}: {
  content: string;
  className?: string;
}) {
  const text = content || "";
  const segments = parseSpoilerSegments(text);

  if (!hasSpoilerSegments(segments)) {
    return (
      <div className={className}>
        <BlockMarkdown content={text} />
      </div>
    );
  }

  return <div className={className}>{renderWithSpoilers(text)}</div>;
}
