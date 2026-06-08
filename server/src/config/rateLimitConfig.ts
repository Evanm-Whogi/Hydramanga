/** Per-action rate limit presets (windowMs + max). Override via RATE_LIMIT_* env vars. */

function parseEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

export type RateLimitPreset = { windowMs: number; max: number; message: string };

function preset(windowMs: number, max: number, maxKey: string, windowKey: string, message: string): RateLimitPreset {
  return {
    windowMs: parseEnvNumber(windowKey, windowMs),
    max: parseEnvNumber(maxKey, max),
    message,
  };
}

export const rateLimitPresets = {
  // window: 5 min | max: 80
  listWrite: preset(5 * 60 * 1000, 80, 'RATE_LIMIT_LIST_WRITE_MAX', 'RATE_LIMIT_LIST_WRITE_WINDOW_MS', 'You are updating lists too quickly. Please wait before trying again.'),
  // window: 1 min | max: 60 (GET /manga/search with non-empty `search` only; discover scroll/filter pagination exempt)
  mangaSearch: preset(60 * 1000, 60, 'RATE_LIMIT_SEARCH_MAX', 'RATE_LIMIT_SEARCH_WINDOW_MS', 'Too many searches. Please wait before searching again.'),
  // window: 1 min | max: 15
  chatMessage: preset(60 * 1000, 15, 'RATE_LIMIT_CHAT_MESSAGE_MAX', 'RATE_LIMIT_CHAT_MESSAGE_WINDOW_MS', 'You are sending messages too quickly. Please wait before sending another.'),
  // window: 5 min | max: 40
  chatMutation: preset(5 * 60 * 1000, 40, 'RATE_LIMIT_CHAT_MUTATION_MAX', 'RATE_LIMIT_CHAT_MUTATION_WINDOW_MS', 'You are editing chat messages too quickly. Please wait.'),
  // window: 10 min | max: 5
  boardPost: preset(10 * 60 * 1000, 5, 'RATE_LIMIT_BOARD_POST_MAX', 'RATE_LIMIT_BOARD_POST_WINDOW_MS', 'You are posting too quickly. Please wait before creating another thread.'),
  // window: 5 min | max: 10
  boardReply: preset(5 * 60 * 1000, 10, 'RATE_LIMIT_BOARD_REPLY_MAX', 'RATE_LIMIT_BOARD_REPLY_WINDOW_MS', 'You are replying too quickly. Please wait before posting another reply.'),
  // window: 10 min | max: 30
  boardMutation: preset(10 * 60 * 1000, 30, 'RATE_LIMIT_BOARD_MUTATION_MAX', 'RATE_LIMIT_BOARD_MUTATION_WINDOW_MS', 'You are changing board posts too quickly. Please wait.'),
  // window: 1 min | max: 40
  boardVote: preset(60 * 1000, 40, 'RATE_LIMIT_BOARD_VOTE_MAX', 'RATE_LIMIT_BOARD_VOTE_WINDOW_MS', 'You are voting too quickly. Please wait.'),
  // window: 1 min | max: 40
  listVote: preset(60 * 1000, 40, 'RATE_LIMIT_LIST_VOTE_MAX', 'RATE_LIMIT_LIST_VOTE_WINDOW_MS', 'You are voting too quickly. Please wait.'),
  // window: 1 min | max: 30
  listViewTrack: preset(60 * 1000, 30, 'RATE_LIMIT_LIST_VIEW_TRACK_MAX', 'RATE_LIMIT_LIST_VIEW_TRACK_WINDOW_MS', 'Too many view requests. Please wait.'),
  // window: 5 min | max: 10
  listCommentCreate: preset(5 * 60 * 1000, 10, 'RATE_LIMIT_LIST_COMMENT_CREATE_MAX', 'RATE_LIMIT_LIST_COMMENT_CREATE_WINDOW_MS', 'You are commenting too quickly. Please wait before posting again.'),
  // window: 5 min | max: 10
  commentCreate: preset(5 * 60 * 1000, 10, 'RATE_LIMIT_COMMENT_CREATE_MAX', 'RATE_LIMIT_COMMENT_CREATE_WINDOW_MS', 'You are commenting too quickly. Please wait before posting again.'),
  // window: 5 min | max: 40
  commentMutation: preset(5 * 60 * 1000, 40, 'RATE_LIMIT_COMMENT_MUTATION_MAX', 'RATE_LIMIT_COMMENT_MUTATION_WINDOW_MS', 'You are changing comments too quickly. Please wait.'),
  // window: 30 min | max: 10
  reviewCreate: preset(30 * 60 * 1000, 10, 'RATE_LIMIT_REVIEW_CREATE_MAX', 'RATE_LIMIT_REVIEW_CREATE_WINDOW_MS', 'You are submitting reviews too quickly. Please wait before posting another.'),
  // window: 10 min | max: 30
  reviewMutation: preset(10 * 60 * 1000, 30, 'RATE_LIMIT_REVIEW_MUTATION_MAX', 'RATE_LIMIT_REVIEW_MUTATION_WINDOW_MS', 'You are changing reviews too quickly. Please wait.'),
  // window: 1 min | max: 30
  settingsPatch: preset(60 * 1000, 30, 'RATE_LIMIT_SETTINGS_PATCH_MAX', 'RATE_LIMIT_SETTINGS_PATCH_WINDOW_MS', 'You are saving settings too quickly. Please wait.'),
  // window: 1 hour | max: 10
  profilePicture: preset(60 * 60 * 1000, 10, 'RATE_LIMIT_PROFILE_PICTURE_MAX', 'RATE_LIMIT_PROFILE_PICTURE_WINDOW_MS', 'You are changing your profile picture too often. Please wait.'),
  // window: 1 hour | max: 5
  dataExport: preset(60 * 60 * 1000, 5, 'RATE_LIMIT_DATA_EXPORT_MAX', 'RATE_LIMIT_DATA_EXPORT_WINDOW_MS', 'You have exported data too recently. Please wait before exporting again.'),
  // window: 1 hour | max: 3
  dataImport: preset(60 * 60 * 1000, 3, 'RATE_LIMIT_DATA_IMPORT_MAX', 'RATE_LIMIT_DATA_IMPORT_WINDOW_MS', 'You have imported data too recently. Please wait before importing again.'),
  // window: 1 hour | max: 5
  importRequest: preset(60 * 60 * 1000, 5, 'RATE_LIMIT_IMPORT_REQUEST_MAX', 'RATE_LIMIT_IMPORT_REQUEST_WINDOW_MS', 'You have submitted too many import requests. Please wait before submitting another.'),
  // window: 1 hour | max: 3 (clearAllProgress, clearAllViewHistory, deleteViewHistory)
  progressDestructive: preset(60 * 60 * 1000, 3, 'RATE_LIMIT_PROGRESS_DESTRUCTIVE_MAX', 'RATE_LIMIT_PROGRESS_DESTRUCTIVE_WINDOW_MS', 'You are changing reading history too quickly. Please wait before trying again.'),
  // window: 5 min | max: 60
  bookmark: preset(5 * 60 * 1000, 60, 'RATE_LIMIT_BOOKMARK_MAX', 'RATE_LIMIT_BOOKMARK_WINDOW_MS', 'You are updating bookmarks too quickly. Please wait.'),
  // window: 1 hour | max: 10 (contact, DMCA, manga-report)
  publicForm: preset(60 * 60 * 1000, 10, 'RATE_LIMIT_PUBLIC_FORM_MAX', 'RATE_LIMIT_PUBLIC_FORM_WINDOW_MS', 'Too many submissions. Please try again later.'),
} as const;
