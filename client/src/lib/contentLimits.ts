/** Mirror of server CONTENT_LIMITS for client-side maxLength validation. */
export const CONTENT_LIMITS = {
  comment: 10_000,
  review: 20_000,
  boardTitle: 200,
  boardPost: 50_000,
  boardReply: 20_000,
  chatMessage: 2_000,
  listTitle: 200,
  listDescription: 5_000,
  listComment: 10_000,
} as const;
