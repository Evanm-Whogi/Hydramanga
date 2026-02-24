import { pgTable, serial, text, timestamp, varchar, integer, uniqueIndex, boolean, jsonb, real, pgEnum, primaryKey, index} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("user"),
  bio: text("bio"),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image").default('/default-avatar.jpg'),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => user.id),
  token: text("token").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => user.id),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  idToken: text("idToken"),
  password: text("password"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// Series Table
export const series = pgTable('series', {
  id: integer('id').primaryKey(),
  state: text('state'),
  mergedWith: integer('merged_with'),
  title: text('title'),
  nativeTitle: text('native_title'),
  romanizedTitle: text('romanized_title'),
  secondaryTitles: jsonb('secondary_titles'),
  cover: jsonb('cover'),
  authors: jsonb('authors'),
  artists: jsonb('artists'),
  description: text('description'),
  year: integer('year'),
  status: text('status'),
  isLicensed: boolean('is_licensed'),
  hasAnime: boolean('has_anime'),
  anime: jsonb('anime'),
  contentRating: text('content_rating'),
  type: text('type'),
  rating: real('rating'),
  finalVolume: text('final_volume'),
  finalChapter: text('final_chapter'),
  totalChapters: text('total_chapters'),
  links: jsonb('links'),
  publishers: jsonb('publishers'),
  relationships: jsonb('relationships'),
  genres: jsonb('genres'),
  genresV2: jsonb('genres_v2'),
  tags: jsonb('tags'),
  tagsV2: jsonb('tags_v2'),
  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }),
  source: jsonb('source'),
  weightedScore: real('weighted_score').generatedAlwaysAs(
    sql`((COALESCE("rating", 0) * 0.6) + (((
      COALESCE(("source"->'anilist'->>'rating_normalized')::float, 0) +
      COALESCE(("source"->'anime_planet'->>'rating_normalized')::float, 0) +
      COALESCE(("source"->'anime_news_network'->>'rating_normalized')::float, 0) +
      COALESCE(("source"->'kitsu'->>'rating_normalized')::float, 0) +
      COALESCE(("source"->'manga_updates'->>'rating_normalized')::float, 0) +
      COALESCE(("source"->'my_anime_list'->>'rating_normalized')::float, 0) +
      COALESCE(("source"->'shikimori'->>'rating_normalized')::float, 0)
    ) / 7) * 0.4))`
  ),
  contentHash: text('content_hash')
}, (t) => ({
  // Importer optimization
  contentHashIdx: index('idx_series_content_hash').on(t.contentHash),
  
  // Homepage: Popularity and Updates
  ratingIdx: index('idx_series_rating').on(t.rating.desc()),
  lastUpdatedIdx: index('idx_series_last_updated').on(t.lastUpdatedAt.desc()),
  
  // Search Inside Genres and Tags (GIN indexes)
  genresV2Gin: index('idx_series_genres_v2').using('gin', t.genresV2),
  tagsV2Gin: index('idx_series_tags_v2').using('gin', t.tagsV2),
  
  // Fuzzy Search Title (Requires pg_trgm extension)
  titleTrgmIdx: index('idx_series_title_trgm').using('gin', t.title.op('gin_trgm_ops')),
  
  // Composite Filter Logic
  filterLogicIdx: index('idx_series_filter_logic').on(t.type, t.status, t.rating.desc()),
  statusRatingIdx: index('idx_series_status_rating').on(t.status, t.rating.desc()),

  // Discovery default sort (weighted score + id for cursor pagination)
  weightedScoreIdIdx: index('idx_series_weighted_score_id').on(t.weightedScore.desc(), t.id),
}));

// User Custom Lists Table
export const userLists = pgTable('user_lists', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  isVisible: boolean('is_visible').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index('idx_user_lists_user_id').on(t.userId),
  userSlugUnique: uniqueIndex('idx_user_lists_user_slug').on(t.userId, t.slug),
  sortOrderIdx: index('idx_user_lists_sort_order').on(t.userId, t.sortOrder),
}));

// User Series List (Manga in Lists)
export const userSeriesList = pgTable('user_series_list', {
  userId: text('user_id').notNull(), 
  seriesId: integer('series_id').notNull().references(() => series.id),
  listId: integer('list_id').notNull().references(() => userLists.id, { onDelete: 'cascade' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.seriesId] }), // A user can only have a specific series in one list
  seriesIdIdx: index('idx_user_series_list_series_id').on(t.seriesId),
  userIdIdx: index('idx_user_series_list_user_id').on(t.userId),
  listIdIdx: index('idx_user_series_list_list_id').on(t.listId),
  userListUpdatedIdx: index('idx_user_series_list_user_list_updated').on(t.userId, t.listId, t.updatedAt.desc()),
}));

// Announcements
export const announcements = pgTable('announcements', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  type: varchar("type", { length: 50 }).default("info"),
  isPublished: boolean('is_published').default(false).notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // Performance index for published announcements queries
  publishedIdx: index('idx_announcements_published_published_at').on(t.isPublished, t.publishedAt.desc()).where(sql`${t.isPublished} = true`),
}));

// Comments
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  seriesId: integer("seriesId").notNull().references(() => series.id, { onDelete: "cascade" }),
  parentId: integer("parentId").references((): any => comments.id, { onDelete: "cascade" }),
  isSpoiler: boolean("isSpoiler").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({
  // Performance indexes for comment queries
  seriesIdIdx: index("idx_comments_series_id").on(t.seriesId),
  userIdIdx: index("idx_comments_user_id").on(t.userId),
  seriesCreatedAtIdx: index("idx_comments_series_created_at").on(t.seriesId, t.createdAt.desc()).where(sql`${t.parentId} IS NULL`),
  parentIdIdx: index("idx_comments_parent_id").on(t.parentId).where(sql`${t.parentId} IS NOT NULL`),
}));

// Comment Votes (like / dislike)
export const commentLikes = pgTable("comment_likes", {
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  commentId: integer("commentId").notNull().references(() => comments.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("like"), // 'like' | 'dislike'
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.commentId] }),
  commentIdIdx: index("idx_comment_likes_comment_id").on(t.commentId),
}));

// Reviews (one per user per series)
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  rating: integer("rating").notNull(),   // 1–10
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  seriesId: integer("seriesId").notNull().references(() => series.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({
  userSeriesUniq: uniqueIndex("idx_reviews_user_series").on(t.userId, t.seriesId),
  seriesIdIdx: index("idx_reviews_series_id").on(t.seriesId),
  seriesDateIdx: index("idx_reviews_series_date").on(t.seriesId, t.createdAt.desc()),
  userIdIdx: index("idx_reviews_user_id").on(t.userId),
}));

// Review Votes (like / dislike — one vote per user per review)
export const reviewVotes = pgTable("review_votes", {
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  reviewId: integer("reviewId").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'like' | 'dislike'
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.reviewId] }),
  reviewIdIdx: index("idx_review_votes_review_id").on(t.reviewId),
}));


// Chapters Table
export const chapters = pgTable("chapters", {
  id: serial("id").primaryKey(),
  seriesId: integer("series_id").notNull().references(() => series.id, { onDelete: "cascade" }),
  title: text("title"),
  description: text("description"),
  chapterNumber: text("chapter_number").notNull(), 
  volumeNumber: text("volume_number"),
  storagePrefix: text("storage_prefix").notNull(), // Logical object key prefix (e.g., "6029/1" for seriesId/chapterId)
  pageCount: integer("page_count").default(0),
  scraperId: text("scraper_id"), // ID of the scraper that downloaded this chapter (e.g., 'mangadex', 'weebcentral', null if unknown)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // Index for fetching a series' chapters quickly
  seriesIdIdx: index("idx_chapters_series_id").on(t.seriesId),
  // Unique constraint to prevent duplicate chapters per series
  unq: uniqueIndex("idx_chapters_series_unique").on(t.seriesId, t.chapterNumber),
  // Performance indexes for chapter sorting and filtering
  volumeNumberIdx: index("idx_chapters_volume_number").on(t.volumeNumber).where(sql`${t.volumeNumber} IS NOT NULL`),
  scraperIdIdx: index("idx_chapters_scraper_id").on(t.scraperId).where(sql`${t.scraperId} IS NOT NULL`),
}));

// Manga Views Table (for tracking unique views)
export const mangaViews = pgTable('manga_views', {
  id: serial('id').primaryKey(),
  seriesId: integer('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  ipAddress: text('ip_address').notNull(),
  userAgent: text('user_agent').notNull(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }), // Optional: track authenticated users
  viewedAt: timestamp('viewed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // Index for fetching views by series efficiently
  seriesIdIdx: index('idx_manga_views_series_id').on(t.seriesId),
  // Index for time-based queries (trending)
  viewedAtIdx: index('idx_manga_views_viewed_at').on(t.viewedAt.desc()),
  // Composite index for filtering duplicates
  uniqueViewIdx: index('idx_manga_views_unique').on(t.seriesId, t.ipAddress, t.userAgent),
}));

// Manga View Stats (aggregated counts)
export const mangaViewStats = pgTable('manga_view_stats', {
  seriesId: integer('series_id').primaryKey().references(() => series.id, { onDelete: 'cascade' }),
  totalViews: integer('total_views').notNull().default(0),
  uniqueViews: integer('unique_views').notNull().default(0),
  lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // Index for sorting by popularity
  totalViewsIdx: index('idx_manga_view_stats_total').on(t.totalViews.desc()),
  uniqueViewsIdx: index('idx_manga_view_stats_unique').on(t.uniqueViews.desc()),
}));

// Chapter Views Table (for tracking unique views)
export const chapterViews = pgTable('chapter_views', {
  id: serial('id').primaryKey(),
  chapterId: integer('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  seriesId: integer('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  ipAddress: text('ip_address').notNull(),
  userAgent: text('user_agent').notNull(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  viewedAt: timestamp('viewed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  chapterIdIdx: index('idx_chapter_views_chapter_id').on(t.chapterId),
  seriesIdIdx: index('idx_chapter_views_series_id').on(t.seriesId),
  viewedAtIdx: index('idx_chapter_views_viewed_at').on(t.viewedAt.desc()),
  uniqueViewIdx: index('idx_chapter_views_unique').on(t.chapterId, t.ipAddress, t.userAgent),
}));

// Chapter View Stats (aggregated counts)
export const chapterViewStats = pgTable('chapter_view_stats', {
  chapterId: integer('chapter_id').primaryKey().references(() => chapters.id, { onDelete: 'cascade' }),
  totalViews: integer('total_views').notNull().default(0),
  uniqueViews: integer('unique_views').notNull().default(0),
  lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  totalViewsIdx: index('idx_chapter_view_stats_total').on(t.totalViews.desc()),
  uniqueViewsIdx: index('idx_chapter_view_stats_unique').on(t.uniqueViews.desc()),
}));

// User Reading Progress (for authenticated users)
export const userReadingProgress = pgTable('user_reading_progress', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  seriesId: integer('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  lastChapterId: integer('last_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  lastPageNumber: integer('last_page_number').notNull().default(0),
  totalPagesRead: integer('total_pages_read').notNull().default(0),
  percentageCompleted: real('percentage_completed').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.seriesId] }),
  userIdIdx: index('idx_user_reading_progress_user_id').on(t.userId),
  seriesIdIdx: index('idx_user_reading_progress_series_id').on(t.seriesId),
}));

// User Chapter Progress (per-chapter state)
export const userChapterProgress = pgTable('user_chapter_progress', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  chapterId: integer('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  lastPageNumber: integer('last_page_number').notNull().default(0),
  isRead: boolean('is_read').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.chapterId] }),
  userIdIdx: index('idx_user_chapter_progress_user_id').on(t.userId),
  chapterIdIdx: index('idx_user_chapter_progress_chapter_id').on(t.chapterId),
  isReadIdx: index('idx_user_chapter_progress_is_read').on(t.isRead),
}));

// Invite Codes
export const inviteCodes = pgTable('invite_codes', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  createdBy: text('created_by').notNull().references(() => user.id, { onDelete: 'cascade' }),
  usedBy: text('used_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
}, (t) => ({
  codeIdx: index('idx_invite_codes_code').on(t.code),
  createdByIdx: index('idx_invite_codes_created_by').on(t.createdBy),
  usedByIdx: index('idx_invite_codes_used_by').on(t.usedBy),
}));

// Chapter Bookmarks
export const bookmarks = pgTable('bookmarks', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  chapterId: integer('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.chapterId] }),
  userIdIdx: index('idx_bookmarks_user_id').on(t.userId),
  chapterIdIdx: index('idx_bookmarks_chapter_id').on(t.chapterId),
  userChapterIdx: index('idx_bookmarks_user_chapter').on(t.userId, t.chapterId),
  createdAtIdx: index('idx_bookmarks_created_at').on(t.createdAt.desc()),
}));

// Manga Import Progress (for real-time progress tracking)
export const importStatusEnum = pgEnum('import_status', ['scanning', 'downloading', 'completed', 'failed']);
export const mangaImportProgress = pgTable('manga_import_progress', {
  seriesId: integer('series_id').primaryKey().references(() => series.id, { onDelete: 'cascade' }),
  totalChapters: integer('total_chapters').notNull().default(0),
  downloadedChapters: integer('downloaded_chapters').notNull().default(0),
  status: importStatusEnum('status').notNull().default('scanning'),
  scraperId: text('scraper_id'), // ID of the scraper used for this import (e.g., 'mangadex', 'weebcentral', null if unknown)
  scraperUrl: text('scraper_url'), // URL of the manga page on the scraper (avoids re-searching on rescans)
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
}, (t) => ({
  statusIdx: index('idx_manga_import_progress_status').on(t.status),
  updatedAtIdx: index('idx_manga_import_progress_updated_at').on(t.updatedAt.desc()),
  scraperIdIdx: index('idx_manga_import_progress_scraper_id').on(t.scraperId).where(sql`${t.scraperId} IS NOT NULL`),
}));

// User Reading Time Table (per user, per series, per chapter)
export const userReadingTime = pgTable('user_reading_time', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  seriesId: integer('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  chapterId: integer('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  seconds: integer('seconds').notNull().default(0), // Total seconds spent reading this chapter
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.seriesId, t.chapterId] }),
  userIdIdx: index('idx_user_reading_time_user_id').on(t.userId),
  seriesIdIdx: index('idx_user_reading_time_series_id').on(t.seriesId),
  chapterIdIdx: index('idx_user_reading_time_chapter_id').on(t.chapterId),
  updatedAtIdx: index('idx_user_reading_time_updated_at').on(t.updatedAt.desc()),
}));


// Relationships 
export const chaptersRelations = relations(chapters, ({ one }) => ({
  series: one(series, {
    fields: [chapters.seriesId],
    references: [series.id],
  }),
}));

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  user: one(user, {
    fields: [bookmarks.userId],
    references: [user.id],
  }),
  chapter: one(chapters, {
    fields: [bookmarks.chapterId],
    references: [chapters.id],
  }),
}));

export const inviteCodesRelations = relations(inviteCodes, ({ one }) => ({
  creator: one(user, {
    fields: [inviteCodes.createdBy],
    references: [user.id],
    relationName: 'inviteCodesCreated',
  }),
  usedByUser: one(user, {
    fields: [inviteCodes.usedBy],
    references: [user.id],
    relationName: 'inviteCodesUsed',
  }),
}));

export const userReadingProgressRelations = relations(userReadingProgress, ({ one }) => ({
  series: one(series, {
    fields: [userReadingProgress.seriesId],
    references: [series.id],
  }),
  // If you want to include the last chapter read:
  lastChapter: one(chapters, {
    fields: [userReadingProgress.lastChapterId],
    references: [chapters.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  author: one(user, {
    fields: [comments.userId],
    references: [user.id],
  }),
  series: one(series, {
    fields: [comments.seriesId],
    references: [series.id],
  }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "comment_replies",
  }),
  replies: many(comments, {
    relationName: "comment_replies",
  }),
  votes: many(commentLikes),
}));

export const commentLikesRelations = relations(commentLikes, ({ one }) => ({
  comment: one(comments, {
    fields: [commentLikes.commentId],
    references: [comments.id],
  }),
  user: one(user, {
    fields: [commentLikes.userId],
    references: [user.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  author: one(user, {
    fields: [reviews.userId],
    references: [user.id],
  }),
  series: one(series, {
    fields: [reviews.seriesId],
    references: [series.id],
  }),
  votes: many(reviewVotes),
}));

export const reviewVotesRelations = relations(reviewVotes, ({ one }) => ({
  review: one(reviews, {
    fields: [reviewVotes.reviewId],
    references: [reviews.id],
  }),
  user: one(user, {
    fields: [reviewVotes.userId],
    references: [user.id],
  }),
}));

export const userListsRelations = relations(userLists, ({ one, many }) => ({
  user: one(user, {
    fields: [userLists.userId],
    references: [user.id],
  }),
  items: many(userSeriesList),
}));

export const userSeriesListRelations = relations(userSeriesList, ({ one }) => ({
  series: one(series, {
    fields: [userSeriesList.seriesId],
    references: [series.id],
  }),
  list: one(userLists, {
    fields: [userSeriesList.listId],
    references: [userLists.id],
  }),
}));

export const seriesRelations = relations(series, ({ many }) => ({
  usersTracking: many(userSeriesList),
  chapters: many(chapters),
  comments: many(comments),
  reviews: many(reviews),
}));