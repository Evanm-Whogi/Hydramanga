"use client";

import { useState } from "react";
import { BlockMarkdown, InlineMarkdown } from "./markdownRenderers";

function spoilerNeedsBlockLayout(content: string): boolean {
  return content.includes("\n") || /^(\s*[-*+]|\s*\d+\.)\s/m.test(content);
}

export default function Spoiler({content, inline = false}: {
  content: string;
  inline?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const useBlockReveal = !inline || spoilerNeedsBlockLayout(content);

  if (!revealed) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRevealed(true);
        }}
        className="inline-block align-middle mx-0.5 rounded-full bg-black hover:bg-zinc-800 active:bg-zinc-700 transition-colors cursor-pointer h-5 min-w-[3.25rem] px-0 border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        aria-label="Reveal spoiler"
        title="Click to reveal spoiler"
      />
    );
  }

  if (useBlockReveal) {
    return (
      <div className="my-1 rounded-md bg-background/80 border border-borders/50 px-2 py-1">
        <BlockMarkdown content={content} />
      </div>
    );
  }

  return (
    <span className="inline rounded-md bg-background/80 border border-borders/50 px-1 py-0.5">
      <InlineMarkdown content={content} />
    </span>
  );
}
