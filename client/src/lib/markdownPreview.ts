import { extractImageUrls } from "@/lib/contentImages";

function stripEmbeddedImageRefs(markdown: string): string {
  let result = markdown;
  for (const url of extractImageUrls(markdown)) {
    result = result.split(url).join(" ");
  }
  return result;
}

/** Strip markdown to plain text for compact previews (line-clamp friendly). */
export function markdownToPlainText(markdown: string): string {
  if (!markdown) return "";

  return stripEmbeddedImageRefs(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\|\|([\s\S]+?)\|\|/g, "[spoiler]")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
