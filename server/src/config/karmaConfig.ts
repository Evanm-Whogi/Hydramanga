export const KARMA_AMOUNTS = {
  comment: 10,
  review: 15,
  chapter_read: 5,
  list_add: 3,
  board_post: 8,
  board_reply: 5,
} as const;

export type KarmaAction = keyof typeof KARMA_AMOUNTS;

export const LEVEL_THRESHOLDS = [
  0, 500, 1500, 3000, 5000, 8000, 12000, 17000, 23000, 30000,
];

export const LEVEL_NAMES = [
  'Rookie Reader',
  'Page Turner',
  'Bookworm',
  'Story Seeker',
  'Manga Enthusiast',
  'Panel Prodigy',
  'Chapter Champion',
  'Volume Virtuoso',
  'Library Legend',
  'Manga Master',
];

/** Minimum seconds of reading time in a day to count as a reading day */
export const READING_TIME_DAY_THRESHOLD_SECONDS = 60;
