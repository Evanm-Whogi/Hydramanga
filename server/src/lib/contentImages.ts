import { CONTENT_LIMITS } from '@/lib/securityLimits';
import { isAllowedStickerImageUrl } from '@/lib/stickerImagePath';

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
const CODE_RE = /(```[\s\S]*?```|`[^`\n]+`)/g;
const BARE_IMAGE_REF_RE = /(?:https?:\/\/[^\s<>"'()]+|\/[^\s<>"'()]+)/gi;
const MARKDOWN_IMAGE_REF_RE = /!\[[^\]]*]\(([^)]+)\)/gi;

export function hasTraversalSegments(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes('..') || lower.includes('\\') || lower.includes('\0') || lower.includes('%2e%2e');
}

function looksLikeImageReference(url: string): boolean {
  if (url.startsWith('/')) return true;
  try {
    return IMAGE_EXT_RE.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function isExternalImageUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

export function isAllowedExternalImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > CONTENT_LIMITS.contentImageUrlMaxLength) return false;
  if (hasTraversalSegments(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (hasTraversalSegments(parsed.pathname)) return false;
    return IMAGE_EXT_RE.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isAllowedImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > CONTENT_LIMITS.contentImageUrlMaxLength) return false;
  if (hasTraversalSegments(trimmed)) return false;
  if (trimmed.startsWith('/')) {
    const pathOnly = trimmed.split('?')[0].split('#')[0];
    return isAllowedStickerImageUrl(pathOnly);
  }
  return isAllowedExternalImageUrl(trimmed);
}

type TextChunk = { text: string; skip: boolean };

function splitSkippingCode(content: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(CODE_RE.source, 'g');
  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) chunks.push({ text: content.slice(lastIndex, match.index), skip: false });
    chunks.push({ text: match[0], skip: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) chunks.push({ text: content.slice(lastIndex), skip: false });
  return chunks.length > 0 ? chunks : [{ text: content, skip: false }];
}

function stripTrailingPunct(url: string): string {
  return url.replace(/[),.!?]+$/, '');
}

export function extractImageUrls(content: string): string[] {
  const urls: string[] = [];
  for (const chunk of splitSkippingCode(content)) {
    if (chunk.skip) continue;
    let match: RegExpExecArray | null;
    const mdRe = new RegExp(MARKDOWN_IMAGE_REF_RE.source, 'gi');
    while ((match = mdRe.exec(chunk.text)) !== null) {
      const url = stripTrailingPunct(match[1].trim());
      if (isAllowedImageUrl(url)) urls.push(url);
    }
    const bareRe = new RegExp(BARE_IMAGE_REF_RE.source, 'gi');
    while ((match = bareRe.exec(chunk.text)) !== null) {
      const url = stripTrailingPunct(match[0]);
      if (isAllowedImageUrl(url)) urls.push(url);
    }
  }
  return [...new Set(urls)];
}

export function getContentImageValidationError(content: string): string | null {
  const urls = extractImageUrls(content);
  if (urls.length > CONTENT_LIMITS.contentMaxImages) {
    return `Content may include at most ${CONTENT_LIMITS.contentMaxImages} images`;
  }
  for (const chunk of splitSkippingCode(content)) {
    if (chunk.skip) continue;
    let match: RegExpExecArray | null;
    const mdRe = new RegExp(MARKDOWN_IMAGE_REF_RE.source, 'gi');
    while ((match = mdRe.exec(chunk.text)) !== null) {
      const url = stripTrailingPunct(match[1].trim());
      if (url && looksLikeImageReference(url) && !isAllowedImageUrl(url)) {
        return 'Content includes a disallowed image URL';
      }
    }
    const bareRe = new RegExp(BARE_IMAGE_REF_RE.source, 'gi');
    while ((match = bareRe.exec(chunk.text)) !== null) {
      const url = stripTrailingPunct(match[0]);
      if (url && looksLikeImageReference(url) && !isAllowedImageUrl(url)) {
        return 'Content includes a disallowed image URL';
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
    .join('');
}
