export const FORUM_CATEGORY_VALUES = [
  'announcements',
  'general',
  'suggestions',
  'bugs',
  'help',
  'releases',
  'guides',
  'discussions',
  'feedback',
  'off-topic',
] as const;

export type ForumCategory = (typeof FORUM_CATEGORY_VALUES)[number];

export const DEFAULT_FORUM_CATEGORY: ForumCategory = 'general';

export function isForumCategory(value: string): value is ForumCategory {
  return (FORUM_CATEGORY_VALUES as readonly string[]).includes(value);
}
