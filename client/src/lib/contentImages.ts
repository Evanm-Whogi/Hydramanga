const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
// Canonical same-origin sticker path (buckets are private; this 302s to a presigned URL).
const STICKER_API_PREFIX = "/api/media/sticker/";
// Legacy site path prefix, kept so historical stored content still validates/renders.
const STICKER_MEDIA_PREFIX = "/media/stickers/";
// Legacy public sticker-bucket hosts embedded in historical content (pre-private-bucket).
const LEGACY_STICKER_HOSTS = new Set(["stickers.garage.chit.sh"]);
const CODE_RE = /(```[\s\S]*?```|`[^`\n]+`)/g;
const BARE_IMAGE_REF_RE = /(?:https?:\/\/[^\s<>"'()]+|\/[^\s<>"'()]+)/gi;
const MARKDOWN_IMAGE_REF_RE = /!\[[^\]]*]\(([^)]+)\)/gi;

export const CONTENT_IMAGE_LIMITS = {
  maxImages: 3,
  urlMaxLength: 500,
  maxImageBytes: 10_000_000,
} as const;

function hasTraversalSegments(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes("..") || lower.includes("\\") || lower.includes("\0") || lower.includes("%2e%2e");
}

function isSafeStickerFilename(filename: string): boolean {
  return (
    filename.length > 0 &&
    filename.length <= 128 &&
    !filename.includes("..") &&
    !filename.includes("/") &&
    !filename.includes("\\") &&
    !filename.includes("\0") &&
    !filename.startsWith(".") &&
    IMAGE_EXT_RE.test(filename)
  );
}

function isAllowedStickerImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > CONTENT_IMAGE_LIMITS.urlMaxLength) return false;
  const pathOnly = trimmed.split("?")[0].split("#")[0];
  for (const prefix of [STICKER_API_PREFIX, STICKER_MEDIA_PREFIX]) {
    if (pathOnly.startsWith(prefix)) return isSafeStickerFilename(pathOnly.slice(prefix.length));
  }
  return false;
}

/**
 * Extract the sticker filename from a historical embed — a legacy `/media/stickers/<file>`
 * site path or an old public sticker-bucket URL — so it can be rewritten to the canonical
 * same-origin path. Returns null for anything that isn't a recognised sticker reference.
 */
function stickerFilenameFromHistorical(url: string): string | null {
  const trimmed = url.trim();
  const pathOnly = trimmed.split("?")[0].split("#")[0];
  if (pathOnly.startsWith(STICKER_MEDIA_PREFIX)) {
    const filename = pathOnly.slice(STICKER_MEDIA_PREFIX.length);
    return isSafeStickerFilename(filename) ? filename : null;
  }
  if (isExternalImageUrl(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (LEGACY_STICKER_HOSTS.has(parsed.hostname)) {
        const filename = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
        return isSafeStickerFilename(filename) ? filename : null;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function looksLikeImageReference(url: string): boolean {
  if (url.startsWith("/")) return true;
  try {
    return IMAGE_EXT_RE.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function isAllowedExternalImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > CONTENT_IMAGE_LIMITS.urlMaxLength) return false;
  if (hasTraversalSegments(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (hasTraversalSegments(parsed.pathname)) return false;
    return IMAGE_EXT_RE.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isExternalImageUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

export function isAllowedImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > CONTENT_IMAGE_LIMITS.urlMaxLength) return false;
  if (hasTraversalSegments(trimmed)) return false;
  if (trimmed.startsWith("/")) {
    const pathOnly = trimmed.split("?")[0].split("#")[0];
    return isAllowedStickerImageUrl(pathOnly);
  }
  return isAllowedExternalImageUrl(trimmed);
}

export function toContentImageDisplayUrl(url: string): string {
  const trimmed = url.trim();
  // Already-canonical sticker path → serve as-is (same-origin redirect to a presigned URL).
  if (trimmed.startsWith(STICKER_API_PREFIX)) return trimmed;
  // Historical sticker embed (legacy site path or old public bucket URL) → canonical path.
  // Without this, old content 403s the instant the sticker bucket goes private.
  const stickerFile = stickerFilenameFromHistorical(trimmed);
  if (stickerFile) return `${STICKER_API_PREFIX}${stickerFile}`;
  if (!isAllowedImageUrl(url)) return url;
  if (isExternalImageUrl(url)) {
    return `/api/content-images/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
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

export function getContentImageValidationError(content: string): string | null {
  const urls = extractImageUrls(content);
  if (urls.length > CONTENT_IMAGE_LIMITS.maxImages) {
    return `Content may include at most ${CONTENT_IMAGE_LIMITS.maxImages} images`;
  }
  for (const chunk of splitSkippingCode(content)) {
    if (chunk.skip) continue;
    let match: RegExpExecArray | null;
    const mdRe = new RegExp(MARKDOWN_IMAGE_REF_RE.source, "gi");
    while ((match = mdRe.exec(chunk.text)) !== null) {
      const url = stripTrailingPunct(match[1].trim());
      if (url && looksLikeImageReference(url) && !isAllowedImageUrl(url)) {
        return "Content includes a disallowed image URL";
      }
    }
    const bareRe = new RegExp(BARE_IMAGE_REF_RE.source, "gi");
    while ((match = bareRe.exec(chunk.text)) !== null) {
      const url = stripTrailingPunct(match[0]);
      if (url && looksLikeImageReference(url) && !isAllowedImageUrl(url)) {
        return "Content includes a disallowed image URL";
      }
    }
  }
  return null;
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
