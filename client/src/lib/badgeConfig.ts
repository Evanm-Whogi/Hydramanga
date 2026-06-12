export type BadgeCategory = 'reading' | 'community' | 'reviews' | 'discovery' | 'collection' | 'social' | 'prestige' | 'legacy' | 'secrets' | 'management';

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
  { id: 'first_bite', name: 'First Bite', description: 'Every journey begins with a single page.', requirementText: 'Read your very first chapter on HydraManga.', category: 'reading', icon: 'BookOpen', color: '#F472B6' },
  { id: 'marathon_reader', name: 'Marathon Reader', description: 'Time flies when the plot thickens.', requirementText: 'Accumulate 24 hours of total reading time.', category: 'reading', icon: 'Timer', color: '#FB923C' },
  { id: 'completionist', name: 'Completionist', description: 'You always see things through to the very end.', requirementText: 'Move 25 series to your "Finished" list.', category: 'reading', icon: 'CheckCircle2', color: '#10B981' },
  { id: 'avid_reader', name: 'Avid Reader', description: 'Devouring the library, one series at a time.', requirementText: 'Read at least one chapter from 50 different titles.', category: 'reading', icon: 'Library', color: '#818CF8' },
  { id: 'daily_ritual', name: 'Daily Ritual', description: 'Not a single day wasted.', requirementText: 'Read at least one chapter every day for 14 days.', category: 'reading', icon: 'CalendarCheck', color: '#F59E0B' },
  { id: 'hydra_disciple', name: 'Hydra Disciple', description: 'The obsession is taking hold.', requirementText: 'Maintain a 30-day reading streak.', category: 'reading', icon: 'Flame', color: '#EF4444' },
  { id: 'hydra_champion', name: 'Hydra Champion', description: 'You practically live here.', requirementText: 'Maintain a 100-day reading streak.', category: 'reading', icon: 'Trophy', color: '#EAB308' },
  { id: 'first_head', name: 'First Head', description: 'The Hydra awakens.', requirementText: 'Read 100 chapters.', category: 'reading', icon: 'Hash', color: '#84CC16' },
  { id: 'growing_heads', name: 'Growing Heads', description: 'Every story feeds the beast.', requirementText: 'Read 500 chapters.', category: 'reading', icon: 'TrendingUp', color: '#22C55E' },
  { id: 'many_headed_beast', name: 'Many-Headed Beast', description: 'Your appetite cannot be contained.', requirementText: 'Read 2,500 chapters.', category: 'reading', icon: 'Layers', color: '#14B8A6' },
  { id: 'hydra_unleashed', name: 'Hydra Unleashed', description: 'An unstoppable force of reading.', requirementText: 'Read 10,000 chapters.', category: 'reading', icon: 'Zap', color: '#06B6D4' },
  { id: 'legendary_hydra', name: 'Legendary Hydra', description: 'Few can comprehend your appetite.', requirementText: 'Read 25,000 chapters.', category: 'reading', icon: 'Crown', color: '#8B5CF6' },
  { id: 'hydra_eternal', name: 'Hydra Eternal', description: 'Legends never finish reading.', requirementText: 'Read 50,000 chapters.', category: 'reading', icon: 'Infinity', color: '#A855F7' },
  { id: 'under_the_radar', name: 'Under the Radar', description: 'Some secrets are best kept in the shadows.', requirementText: 'Read 50 chapters while using Incognito mode.', category: 'reading', icon: 'EyeOff', color: '#6B7280' },
  { id: 'night_owl', name: 'Night Owl', description: 'Sleep can wait.', requirementText: 'Read chapters between midnight and 5 AM on 7 different days.', category: 'reading', icon: 'Moon', color: '#6366F1' },
  { id: 'ancient_scrolls', name: 'Ancient Scrolls', description: 'Respecting the classics.', requirementText: 'Read 25 series released before 2000.', category: 'reading', icon: 'Scroll', color: '#A16207' },
  { id: 'first_responder', name: 'First Responder', description: 'Fresh chapters wait for no one.', requirementText: 'Read 25 newly released chapters within 1 hour of publication.', category: 'reading', icon: 'Siren', color: '#F97316' },
  { id: 'cut_off_one_head', name: 'Cut Off One Head', description: 'Every ending leads to a new beginning.', requirementText: 'Move a completed series to your Finished list and begin reading a new series on the same day.', category: 'reading', icon: 'Scissors', color: '#78716C' },
  { id: 'breaking_the_silence', name: 'Breaking the Silence', description: 'Every discussion starts somewhere.', requirementText: 'Leave your first comment.', category: 'community', icon: 'MessageSquare', color: '#38BDF8' },
  { id: 'chatterbox', name: 'Chatterbox', description: 'Keeping the real-time conversation alive.', requirementText: 'Send 100 messages in the real-time chat.', category: 'community', icon: 'MessageCircle', color: '#60A5FA' },
  { id: 'chapter_chatter', name: 'Chapter Chatter', description: 'You always have something to say when the cliffhanger hits.', requirementText: 'Leave comments on 100 different mangas.', category: 'community', icon: 'MessagesSquare', color: '#34D399' },
  { id: 'conversation_starter', name: 'Conversation Starter', description: 'Some discussions take on a life of their own.', requirementText: 'Leave a post on the Community Board that receives 25 replies.', category: 'community', icon: 'Sparkles', color: '#F472B6' },
  { id: 'forum_dweller', name: 'Forum Dweller', description: "There's always one more thread to read.", requirementText: 'Participate in 100 Community Board discussions.', category: 'community', icon: 'LayoutList', color: '#2DD4BF' },
  { id: 'the_pioneer', name: 'The Pioneer', description: 'Planting your flag before anyone else arrives.', requirementText: 'Be the very first person to leave a comment on a manga series.', category: 'community', icon: 'Flag', color: '#FBBF24' },
  { id: 'critic', name: 'Critic', description: 'Every masterpiece deserves a verdict.', requirementText: 'Publish 25 reviews.', category: 'reviews', icon: 'Star', color: '#FACC15' },
  { id: 'hydras_voice', name: "Hydra's Voice", description: 'Your opinions echo across the community.', requirementText: 'Leave 5 reviews that receive positive votes from other users.', category: 'reviews', icon: 'Megaphone', color: '#A78BFA' },
  { id: 'trusted_reviewer', name: 'Trusted Reviewer', description: 'When you recommend something, people listen.', requirementText: 'Receive 100 total upvotes across all reviews.', category: 'reviews', icon: 'ThumbsUp', color: '#4ADE80' },
  { id: 'pathfinder', name: 'Pathfinder', description: 'Leading readers to their next obsession.', requirementText: 'Submit a missing-series request that gets approved.', category: 'discovery', icon: 'Compass', color: '#0EA5E9' },
  { id: 'genre_explorer', name: 'Genre Explorer', description: 'You refuse to be boxed in.', requirementText: 'Read series from 15 different genres.', category: 'discovery', icon: 'Palette', color: '#EC4899' },
  { id: 'world_traveler', name: 'World Traveler', description: 'Stories know no borders.', requirementText: 'Read at least 25 Manga, 25 Manhwa, and 25 Manhua.', category: 'discovery', icon: 'Globe', color: '#3B82F6' },
  { id: 'the_forbidden_shelf', name: 'The Forbidden Shelf', description: 'Curiosity wins again.', requirementText: 'Open 100 NSFW titles.', category: 'discovery', icon: 'BookMarked', color: '#BE123C' },
  { id: 'collector', name: 'Collector', description: 'The shelves are getting crowded.', requirementText: 'Add 500 series to your library.', category: 'collection', icon: 'Bookmark', color: '#7C3AED' },
  { id: 'curator', name: 'Curator', description: 'Your taste deserves a museum.', requirementText: 'Create a public list that receives 25 saves.', category: 'collection', icon: 'GalleryVertical', color: '#D946EF' },
  { id: 'profile_perfection', name: 'Profile Perfection', description: 'Looking sharp.', requirementText: 'Complete your profile: bio, avatar, and add a favorite series.', category: 'social', icon: 'UserCheck', color: '#10B981' },
  { id: 'followed', name: 'Followed', description: 'Your reading journey inspires others.', requirementText: 'Gain 100 followers.', category: 'social', icon: 'Users', color: '#06B6D4' },
  { id: 'hydra_master', name: 'Hydra Master', description: 'The user who has read the most chapters on HydraManga.', requirementText: 'Read the most chapters on HydraManga.', category: 'prestige', icon: 'Award', color: '#F59E0B' },
  { id: 'hydras_bloodline', name: "Hydra's Bloodline", description: 'The beast has taken notice.', requirementText: 'Awarded by staff to exceptional members of the HydraManga community.', category: 'prestige', icon: 'Droplets', color: '#DC2626' },
  { id: 'first_generation', name: 'First Generation', description: 'Here before the Hydra grew its heads.', requirementText: 'Joined HydraManga during beta.', category: 'legacy', icon: 'Dna', color: '#64748B' },
  { id: 'original_100', name: 'The Original 100', description: 'Among the very first heads of the Hydra.', requirementText: 'Awarded to the first 100 users to join HydraManga.', category: 'legacy', icon: 'Medal', color: '#CA8A04' },
  { id: 'original_1000', name: 'The Original 1000', description: 'Present before the Hydra conquered the seas.', requirementText: 'Awarded to the first 1,000 users to join HydraManga.', category: 'legacy', icon: 'Gem', color: '#0891B2' },
  { id: 'easter_egg_hunter', name: 'Easter Egg Hunter', description: "You clicked something you probably shouldn't have.", requirementText: 'Discover a hidden site easter egg.', category: 'secrets', icon: 'Egg', color: '#A3E635' },
  { id: 'hydra_staff', name: 'Hydra Staff', description: 'The tamers who keep the beast fed and the community safe.', requirementText: 'Granted automatically to users with the Moderator or Admin role.', category: 'management', icon: 'Shield', color: '#14B8A6' },
  { id: 'severed_head', name: 'Severed Head', description: 'This user broke the rules and is currently in the dungeon.', requirementText: 'Applied automatically when a user account is Suspended or Banned.', category: 'management', icon: 'Skull', color: '#DC2626' },
];

export const BADGE_BY_ID = Object.fromEntries(BADGE_DEFINITIONS.map((b) => [b.id, b])) as Record<string, BadgeDefinition>;

export const BADGE_PILLAR_ORDER: BadgeCategory[] = ['reading', 'community', 'reviews', 'discovery', 'collection', 'social', 'prestige', 'legacy', 'secrets', 'management'];
