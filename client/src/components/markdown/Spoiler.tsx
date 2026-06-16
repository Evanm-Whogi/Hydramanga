"use client";

import { useState, type KeyboardEvent, type KeyboardEventHandler, type MouseEvent, type MouseEventHandler } from "react";
import { BlockMarkdown, InlineMarkdown } from "./markdownRenderers";

function spoilerNeedsBlockLayout(content: string): boolean {
  return content.includes("\n") || /^(\s*[-*+]|\s*\d+\.)\s/m.test(content);
}

function revealProps(onReveal: () => void): {
  role: "button";
  tabIndex: number;
  onClick: MouseEventHandler<HTMLElement>;
  onKeyDown: KeyboardEventHandler<HTMLElement>;
  "aria-label": string;
  title: string;
} {
  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onReveal();
    }
  };

  return {
    role: "button",
    tabIndex: 0,
    onClick: (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onReveal();
    },
    onKeyDown: handleKeyDown,
    "aria-label": "Reveal spoiler",
    title: "Click to reveal spoiler",
  };
}

export default function Spoiler({ content, inline = false }: { content: string; inline?: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const useBlockReveal = !inline || spoilerNeedsBlockLayout(content);
  const markdown = useBlockReveal ? <BlockMarkdown content={content} /> : <InlineMarkdown content={content} />;

  const shellClass = [
    "transition-[filter,opacity] duration-300 ease-out",
    useBlockReveal ? (revealed ? "my-1" : "my-1 inline-block w-fit max-w-full") : "inline mx-0.5",
    revealed
      ? "blur-0 opacity-100"
      : "blur-[0.25rem] opacity-60 select-none cursor-pointer [&_*]:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
  ].join(" ");

  if (useBlockReveal) {
    return (
      <div {...(!revealed ? revealProps(() => setRevealed(true)) : {})} className={shellClass}>
        {markdown}
      </div>
    );
  }

  return (
    <span {...(!revealed ? revealProps(() => setRevealed(true)) : {})} className={shellClass}>
      {markdown}
    </span>
  );
}
