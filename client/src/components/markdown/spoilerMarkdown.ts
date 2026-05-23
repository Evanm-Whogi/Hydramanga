export type SpoilerSegment =
  | { type: "markdown"; value: string }
  | { type: "spoiler"; value: string };

const SPOILER_RE = /\|\|([\s\S]+?)\|\|/g;
const CODE_RE = /(```[\s\S]*?```|`[^`\n]+`)/g;

/** Split content into markdown and spoiler segments (skips || inside code). */
export function parseSpoilerSegments(content: string): SpoilerSegment[] {
  const segments: SpoilerSegment[] = [];
  const chunks: { text: string; skip: boolean }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CODE_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      chunks.push({ text: content.slice(lastIndex, match.index), skip: false });
    }
    chunks.push({ text: match[0], skip: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    chunks.push({ text: content.slice(lastIndex), skip: false });
  }

  if (chunks.length === 0) {
    splitSpoilersInText(content, segments);
    return segments.length > 0 ? segments : [{ type: "markdown", value: content }];
  }

  for (const chunk of chunks) {
    if (chunk.skip) {
      segments.push({ type: "markdown", value: chunk.text });
    } else {
      splitSpoilersInText(chunk.text, segments);
    }
  }

  return segments.length > 0 ? segments : [{ type: "markdown", value: content }];
}

function splitSpoilersInText(text: string, out: SpoilerSegment[]) {
  let last = 0;
  const re = new RegExp(SPOILER_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ type: "markdown", value: text.slice(last, m.index) });
    }
    out.push({ type: "spoiler", value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push({ type: "markdown", value: text.slice(last) });
  }
}

export function hasSpoilerSegments(segments: SpoilerSegment[]): boolean {
  return segments.some((s) => s.type === "spoiler");
}
