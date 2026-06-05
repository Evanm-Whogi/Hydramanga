const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
const CODE_RE = /(```[\s\S]*?```|`[^`\n]+`)/g;
const BARE_IMAGE_REF_RE = /(?:https?:\/\/[^\s<>"'()]+|\/[^\s<>"'()]+)/gi;
const MARKDOWN_IMAGE_REF_RE = /!\[[^\]]*]\(([^)]+)\)/gi;

export function isAllowedImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return IMAGE_EXT_RE.test(trimmed.split("?")[0]);
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return IMAGE_EXT_RE.test(parsed.pathname);
  } catch {
    return false;
  }
}

type TextChunk = { text: string; skip: boolean };

function splitSkippingCode(content: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(CODE_RE.source, "g");
  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) chunks.push({ text: content.slice(lastIndex, match.index), skip: false });
    chunks.push({ text: match[0], skip: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) chunks.push({ text: content.slice(lastIndex), skip: false });
  return chunks.length > 0 ? chunks : [{ text: content, skip: false }];
}

function stripTrailingPunct(url: string): string {
  return url.replace(/[),.!?]+$/, "");
}

function collectUrlsFromText(text: string, urls: string[]) {
  let match: RegExpExecArray | null;
  const mdRe = new RegExp(MARKDOWN_IMAGE_REF_RE.source, "gi");
  while ((match = mdRe.exec(text)) !== null) {
    const url = stripTrailingPunct(match[1].trim());
    if (isAllowedImageUrl(url)) urls.push(url);
  }
  const bareRe = new RegExp(BARE_IMAGE_REF_RE.source, "gi");
  while ((match = bareRe.exec(text)) !== null) {
    const url = stripTrailingPunct(match[0]);
    if (isAllowedImageUrl(url)) urls.push(url);
  }
}

export function extractImageUrls(content: string): string[] {
  const urls: string[] = [];
  for (const chunk of splitSkippingCode(content)) {
    if (chunk.skip) continue;
    collectUrlsFromText(chunk.text, urls);
  }
  return [...new Set(urls)];
}

export function embedImageUrlsForMarkdown(content: string): string {
  return splitSkippingCode(content)
    .map((chunk) => {
      if (chunk.skip) return chunk.text;
      return chunk.text.replace(/(^|[\s\n])((?:https?:\/\/[^\s<>"'()]+|\/[^\s<>"'()]+))(?=$|[\s\n])/gi, (match, prefix, rawUrl) => {
        const url = stripTrailingPunct(rawUrl);
        const suffix = rawUrl.slice(url.length);
        if (!isAllowedImageUrl(url)) return match;
        return `${prefix}![](${url})${suffix}`;
      });
    })
    .join("");
}

export function insertTextAtSelection(text: string, insertion: string, start: number, end: number): { value: string; cursor: number } {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const padBefore = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
  const padAfter = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
  const insert = `${padBefore}${insertion}${padAfter}`;
  const value = before + insert + after;
  return { value, cursor: before.length + insert.length };
}
