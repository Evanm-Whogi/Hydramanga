export type BadgeCategory = 'chatting' | 'reading' | 'core';

export type BadgeDefinition = {
  id: string;
  name: string;
  description: string;
  requirementText: string;
  category: BadgeCategory;
  icon: string;
  color: string;
};

export type EarnedBadge = BadgeDefinition & { earnedAt?: string };

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: 'chatterbox', name: 'Chatterbox', description: 'Keeping the real-time conversation alive.', requirementText: 'Send 100 messages in the real-time chat.', category: 'chatting', icon: 'MessageCircle', color: '#60A5FA' },
  { id: 'chapter_chatter', name: 'Chapter Chatter', description: 'You always have something to say when the cliffhanger hits.', requirementText: 'Leave comments on 100 different mangas.', category: 'chatting', icon: 'MessagesSquare', color: '#34D399' },
  { id: 'the_pioneer', name: 'The Pioneer', description: 'Planting your flag before anyone else arrives.', requirementText: 'Be the very first person to leave a comment on a manga series.', category: 'chatting', icon: 'Flag', color: '#FBBF24' },
  { id: 'hydras_voice', name: "Hydra's Voice", description: 'Your opinions echo across the community.', requirementText: 'Leave 5 reviews that receive positive votes from other users.', category: 'chatting', icon: 'Megaphone', color: '#A78BFA' },
  { id: 'first_bite', name: 'First Bite', description: 'Every journey begins with a single page.', requirementText: 'Read your very first chapter on HydraManga.', category: 'reading', icon: 'BookOpen', color: '#F472B6' },
  { id: 'marathon_reader', name: 'Marathon Reader', description: 'Time flies when the plot thickens.', requirementText: 'Accumulate 24 hours of total reading time.', category: 'reading', icon: 'Timer', color: '#FB923C' },
  { id: 'unbroken_streak', name: 'Unbroken Streak', description: 'The daily grind has nothing on your reading habits.', requirementText: 'Maintain a 7-day reading streak.', category: 'reading', icon: 'Flame', color: '#EF4444' },
  { id: 'under_the_radar', name: 'Under the Radar', description: 'Some secrets are best kept in the shadows.', requirementText: 'Read 50 chapters while using Incognito mode.', category: 'reading', icon: 'EyeOff', color: '#6B7280' },
  { id: 'completionist', name: 'Completionist', description: 'You always see things through to the very end.', requirementText: 'Move 25 series to your "Finished" list.', category: 'reading', icon: 'CheckCircle2', color: '#10B981' },
  { id: 'avid_reader', name: 'Avid Reader', description: 'Devouring the library, one series at a time.', requirementText: 'Read at least one chapter from 50 different titles.', category: 'reading', icon: 'Library', color: '#818CF8' },
  { id: 'hydra_staff', name: 'Hydra Staff', description: 'The tamers who keep the beast fed and the community safe.', requirementText: 'Granted automatically to users with the Moderator or Admin role.', category: 'core', icon: 'Shield', color: '#14B8A6' },
  { id: 'severed_head', name: 'Severed Head', description: 'This user broke the rules and is currently in the dungeon.', requirementText: 'Applied automatically when a user account is Suspended or Banned.', category: 'core', icon: 'Skull', color: '#DC2626' },
];

export const BADGE_BY_ID = Object.fromEntries(BADGE_DEFINITIONS.map((b) => [b.id, b])) as Record<string, BadgeDefinition>;
