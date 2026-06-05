/** Strips abusive invisible/bidi Unicode, trims, and collapses excessive blank lines. */
export function normalizeUserContent(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}
