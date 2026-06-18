export const FORUM_CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'announcements', label: 'Announcements' },
  { value: 'general', label: 'General' },
  { value: 'suggestions', label: 'Suggestions' },
  { value: 'bugs', label: 'Bugs' },
  { value: 'help', label: 'Help' },
  { value: 'releases', label: 'Releases' },
  { value: 'guides', label: 'Guides' },
  { value: 'discussions', label: 'Discussions' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'off-topic', label: 'Off-Topic' },
] as const;

export const FORUM_POST_CATEGORY_OPTIONS = FORUM_CATEGORY_OPTIONS.filter((option) => option.value !== 'all');

export const FORUM_SORT_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'top', label: 'Top' },
  { value: 'oldest', label: 'Oldest' },
] as const;

export type ForumSort = (typeof FORUM_SORT_OPTIONS)[number]['value'];

export function getForumCategoryLabel(value?: string | null): string {
  const match = FORUM_CATEGORY_OPTIONS.find((option) => option.value === value);
  return match?.label ?? 'General';
}
