/** Shared content and import size limits (DoS / storage abuse). */
export const CONTENT_LIMITS = {
  comment: 10_000, // 10,000 characters
  review: 20_000, // 20,000 characters
  boardTitle: 200, // 200 characters
  boardPost: 50_000, // 50,000 characters
  boardReply: 20_000, // 20,000 characters
  chatMessage: 2_000, // 2,000 characters
  importMaxBookmarks: 5_000, // 5,000 bookmarks
  importMaxLists: 100, // 100 lists
  importMaxListItemsPerList: 2_000, // 2,000 items per list
  importMaxProgressRows: 10_000, // 10,000 progress rows
  importMaxViewHistory: 50_000, // 50,000 view history
  importPayloadMaxBytes: 2_000_000, // 2,000,000 bytes
} as const;

export function exceedsLimit(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length > max;
}
