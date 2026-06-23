import { pgTable, serial, text, timestamp, varchar, integer, uniqueIndex, boolean, jsonb, real, pgEnum, primaryKey, index, bigint} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  username: text("username").unique(),
  displayUsername: text("displayUsername"),
  role: text("role").notNull().default("user"),
  bio: text("bio"),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image").default('https://profile-pictures.garage.chit.sh/default.jpg'),
  karmaTotal: integer("karma_total").notNull().default(0),
  banned: boolean("banned").default(false),
  banReason: text("banReason"),
  banExpires: timestamp("banExpires"),
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
  impersonatedBy: text("impersonatedBy"),
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
  /** Lowercased titles + authors for GIN trgm search (maintained by DB trigger). */
  searchText: text('search_text'),
  artists: jsonb('artists'),
  description: text('description'),
  note: text('note'),
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
  genresGin: index('idx_series_genres').using('gin', t.genres),
  tagsGin: index('idx_series_tags').using('gin', t.tags),
  genresV2Gin: index('idx_series_genres_v2').using('gin', t.genresV2),
  tagsV2Gin: index('idx_series_tags_v2').using('gin', t.tagsV2),
  
  // Fuzzy Search Title (Requires pg_trgm extension)
  titleTrgmIdx: index('idx_series_title_trgm').using('gin', t.title.op('gin_trgm_ops')),
  searchTextTrgmIdx: index('idx_series_search_text_trgm').using('gin', t.searchText.op('gin_trgm_ops')),
  
  // Composite Filter Logic
  filterLogicIdx: index('idx_series_filter_logic').on(t.type, t.status, t.rating.desc()),
  statusRatingIdx: index('idx_series_status_rating').on(t.status, t.rating.desc()),

  // Discovery default sort (weighted score + id for cursor pagination)
  weightedScoreIdIdx: index('idx_series_weighted_score_id').on(t.weightedScore.desc(), t.id),
}));

export const bookmarkStatusEnum = pgEnum('bookmark_status', ['reading', 'rereading', 'planned', 'completed', 'paused', 'dropped']);

// Series bookmarks (personal reading status — one status per series per user)
export const seriesBookmarks = pgTable('series_bookmarks', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  seriesId: integer('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  status: bookmarkStatusEnum('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.seriesId] }),
  userIdIdx: index('idx_series_bookmarks_user_id').on(t.userId),
  userStatusIdx: index('idx_series_bookmarks_user_status').on(t.userId, t.status),
  seriesIdIdx: index('idx_series_bookmarks_series_id').on(t.seriesId),
}));

export const curatedListVisibilityEnum = pgEnum('curated_list_visibility', ['public', 'private']);

export const curatedLists = pgTable('curated_lists', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 120 }).notNull(),
  description: text('description').default('').notNull(),
  visibility: curatedListVisibilityEnum('visibility').notNull().default('public'),
  viewCount: integer('view_count').notNull().default(0),
  likeCount: integer('like_count').notNull().default(0),
  dislikeCount: integer('dislike_count').notNull().default(0),
  saveCount: integer('save_count').notNull().default(0),
  itemCount: integer('item_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index('idx_curated_lists_user_id').on(t.userId),
  userSlugUniq: uniqueIndex('idx_curated_lists_user_slug').on(t.userId, t.slug),
  visibilityIdx: index('idx_curated_lists_visibility').on(t.visibility),
  popularIdx: index('idx_curated_lists_popular').on(t.likeCount, t.viewCount),
}));

export const curatedListItems = pgTable('curated_list_items', {
  listId: integer('list_id').notNull().references(() => curatedLists.id, { onDelete: 'cascade' }),
  seriesId: integer('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.listId, t.seriesId] }),
  listIdIdx: index('idx_curated_list_items_list_id').on(t.listId),
  seriesIdIdx: index('idx_curated_list_items_series_id').on(t.seriesId),
}));

export const curatedListVotes = pgTable('curated_list_votes', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  listId: integer('list_id').notNull().references(() => curatedLists.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.listId] }),
  listIdIdx: index('idx_curated_list_votes_list_id').on(t.listId),
}));

export const curatedListSaves = pgTable('curated_list_saves', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  listId: integer('list_id').notNull().references(() => curatedLists.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.listId] }),
  listIdIdx: index('idx_curated_list_saves_list_id').on(t.listId),
}));

export const curatedListComments = pgTable('curated_list_comments', {
  id: serial('id').primaryKey(),
  listId: integer('list_id').notNull().references(() => curatedLists.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  parentId: integer('parent_id').references((): any => curatedListComments.id, { onDelete: 'cascade' }),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedBy: text('deleted_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  listIdIdx: index('idx_curated_list_comments_list_id').on(t.listId),
  userIdIdx: index('idx_curated_list_comments_user_id').on(t.userId),
  parentIdIdx: index('idx_curated_list_comments_parent_id').on(t.parentId).where(sql`${t.parentId} IS NOT NULL`),
}));

export const curatedListCommentLikes = pgTable('curated_list_comment_likes', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  commentId: integer('comment_id').notNull().references(() => curatedListComments.id, { onDelete: 'cascade' }),
  type: text('type').notNull().default('like'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.commentId] }),
  commentIdIdx: index('idx_curated_list_comment_likes_comment_id').on(t.commentId),
}));

export const listViews = pgTable('list_views', {
  id: serial('id').primaryKey(),
  listId: integer('list_id').notNull().references(() => curatedLists.id, { onDelete: 'cascade' }),
  ipAddress: text('ip_address').notNull(),
  userAgent: text('user_agent').notNull(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  viewedAt: timestamp('viewed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  listIdIdx: index('idx_list_views_list_id').on(t.listId),
  viewedAtIdx: index('idx_list_views_viewed_at').on(t.viewedAt.desc()),
  uniqueViewIdx: index('idx_list_views_unique').on(t.listId, t.ipAddress, t.userAgent),
}));

export const listViewStats = pgTable('list_view_stats', {
  listId: integer('list_id').primaryKey().references(() => curatedLists.id, { onDelete: 'cascade' }),
  totalViews: integer('total_views').notNull().default(0),
  uniqueViews: integer('unique_views').notNull().default(0),
  lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  totalViewsIdx: index('idx_list_view_stats_total').on(t.totalViews.desc()),
}));

// Comments
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  seriesId: integer("seriesId").notNull().references(() => series.id, { onDelete: "cascade" }),
  chapterId: integer("chapterId").references((): any => chapters.id, { onDelete: "cascade" }),
  parentId: integer("parentId").references((): any => comments.id, { onDelete: "cascade" }),
  isSpoiler: boolean("isSpoiler").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({
  // Performance indexes for comment queries
  seriesIdIdx: index("idx_comments_series_id").on(t.seriesId),
  userIdIdx: index("idx_comments_user_id").on(t.userId),
  seriesCreatedAtIdx: index("idx_comments_series_created_at").on(t.seriesId, t.createdAt.desc()).where(sql`${t.parentId} IS NULL AND ${t.chapterId} IS NULL`),
  chapterCreatedAtIdx: index("idx_comments_chapter_created_at").on(t.chapterId, t.createdAt.desc()).where(sql`${t.parentId} IS NULL AND ${t.chapterId} IS NOT NULL`),
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
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // Index for fetching a series' chapters quickly
  seriesIdIdx: index("idx_chapters_series_id").on(t.seriesId),
  unnotifiedIdx: index("idx_chapters_unnotified").on(t.seriesId).where(sql`${t.notifiedAt} IS NULL`),
  // "Is new" check: chapter in last N days (search/catalog)
  seriesCreatedIdx: index("idx_chapters_series_created").on(t.seriesId, t.createdAt.desc()),
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

/** Singleton row (id = 1) — global site configuration edited from admin Settings. */
export const contentStickers = pgTable('content_stickers', {
  id: serial('id').primaryKey(),
  label: varchar('label', { length: 120 }),
  imageUrl: text('image_url').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  activeSortIdx: index('idx_content_stickers_active_sort').on(t.isActive, t.sortOrder, t.id),
}));

export const siteSettings = pgTable('site_settings', {
  id: integer('id').primaryKey(),
  registrationEnabled: boolean('registration_enabled').notNull().default(true),
  maintenanceMode: boolean('maintenance_mode').notNull().default(false),
  maintenanceMessage: text('maintenance_message'),
  importRequestsEnabled: boolean('import_requests_enabled').notNull().default(true),
  guestReadingEnabled: boolean('guest_reading_enabled').notNull().default(false),
  oauthGoogleEnabled: boolean('oauth_google_enabled').notNull().default(true),
  oauthDiscordEnabled: boolean('oauth_discord_enabled').notNull().default(true),
  welcomeModalEnabled: boolean('welcome_modal_enabled').notNull().default(true),
  welcomeModalTitle: text('welcome_modal_title'),
  welcomeModalDescription: text('welcome_modal_description'),
  welcomeModalBody: text('welcome_modal_body'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// User Settings (e.g. content preferences)
export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  hideNsfw: boolean('hide_nsfw').notNull().default(false),
  isProfilePublic: boolean('is_profile_public').notNull().default(true),
  incognitoMode: boolean('incognito_mode').notNull().default(false),
  incognitoChaptersRead: integer('incognito_chapters_read').notNull().default(0),
  profileVisibility: jsonb('profile_visibility').notNull().default(sql`'{"bio":true,"readingStats":true,"favorites":true,"lists":true,"bookmarks":true,"comments":true,"wall":true,"recentReads":true}'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index('idx_user_settings_user_id').on(t.userId),
}));

export const userFavoriteSeries = pgTable('user_favorite_series', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  seriesId: integer('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.seriesId] }),
  userIdIdx: index('idx_user_favorite_series_user_id').on(t.userId),
}));

export const userFollows = pgTable('user_follows', {
  followerId: text('follower_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  followingId: text('following_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.followerId, t.followingId] }),
  followerIdIdx: index('idx_user_follows_follower_id').on(t.followerId),
  followingIdIdx: index('idx_user_follows_following_id').on(t.followingId),
}));

export const profileWallPosts = pgTable('profile_wall_posts', {
  id: serial('id').primaryKey(),
  wallUserId: text('wall_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  authorUserId: text('author_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  parentId: integer('parent_id').references((): any => profileWallPosts.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  wallUserIdIdx: index('idx_profile_wall_posts_wall_user_id').on(t.wallUserId, t.createdAt.desc()),
  authorUserIdIdx: index('idx_profile_wall_posts_author_user_id').on(t.authorUserId),
  parentIdIdx: index('idx_profile_wall_posts_parent_id').on(t.parentId).where(sql`${t.parentId} IS NOT NULL`),
}));

export const profileWallPostVotes = pgTable('profile_wall_post_votes', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  postId: integer('post_id').notNull().references(() => profileWallPosts.id, { onDelete: 'cascade' }),
  type: text('type').notNull().default('like'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.postId] }),
  postIdIdx: index('idx_profile_wall_post_votes_post_id').on(t.postId),
}));

// Karma ledger
export const karmaTransactions = pgTable('karma_transactions', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  amount: integer('amount').notNull(),
  sourceType: text('source_type'),
  sourceId: text('source_id'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index('idx_karma_transactions_user_id').on(t.userId),
  createdAtIdx: index('idx_karma_transactions_created_at').on(t.createdAt.desc()),
}));

export const userBadges = pgTable('user_badges', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  badgeId: text('badge_id').notNull(),
  earnedAt: timestamp('earned_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.badgeId] }),
  userIdIdx: index('idx_user_badges_user_id').on(t.userId),
}));

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
  impersonatorId: text('impersonator_id').references(() => user.id, { onDelete: 'set null' }),
  actorRole: text('actor_role').notNull().default('anonymous'),
  action: text('action').notNull(),
  category: text('category').notNull(),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  targetUserId: text('target_user_id').references(() => user.id, { onDelete: 'set null' }),
  method: varchar('method', { length: 10 }),
  path: text('path'),
  statusCode: integer('status_code'),
  success: boolean('success').notNull().default(true),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  createdAtIdx: index('idx_audit_logs_created_at').on(t.createdAt.desc()),
  actorIdIdx: index('idx_audit_logs_actor_id').on(t.actorId, t.createdAt.desc()),
  actionIdx: index('idx_audit_logs_action').on(t.action, t.createdAt.desc()),
  categoryIdx: index('idx_audit_logs_category').on(t.category, t.createdAt.desc()),
  resourceIdx: index('idx_audit_logs_resource').on(t.resourceType, t.resourceId),
  targetUserIdIdx: index('idx_audit_logs_target_user_id').on(t.targetUserId, t.createdAt.desc()),
}));

// Daily reading activity for streaks
export const userReadingDays = pgTable('user_reading_days', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  activityDate: timestamp('activity_date', { mode: 'date' }).notNull(),
  source: text('source').notNull().default('chapter_read'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.activityDate] }),
  userIdIdx: index('idx_user_reading_days_user_id').on(t.userId),
}));

// Community board
export const boardPosts = pgTable('board_posts', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  category: varchar('category', { length: 32 }).notNull().default('general'),
  isPinned: boolean('is_pinned').notNull().default(false),
  isLocked: boolean('is_locked').notNull().default(false),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedBy: text('deleted_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  createdAtIdx: index('idx_board_posts_created_at').on(t.createdAt.desc()),
  userIdIdx: index('idx_board_posts_user_id').on(t.userId),
  categoryCreatedAtIdx: index('idx_board_posts_category').on(t.category, t.createdAt.desc()),
}));

export const boardReplies = pgTable('board_replies', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').notNull().references(() => boardPosts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  parentId: integer('parent_id').references((): any => boardReplies.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedBy: text('deleted_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  postIdIdx: index('idx_board_replies_post_id').on(t.postId),
}));

export const boardPostVotes = pgTable('board_post_votes', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  postId: integer('post_id').notNull().references(() => boardPosts.id, { onDelete: 'cascade' }),
  type: text('type').notNull().default('like'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.postId] }),
  postIdIdx: index('idx_board_post_votes_post_id').on(t.postId),
}));

export const boardReplyVotes = pgTable('board_reply_votes', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  replyId: integer('reply_id').notNull().references(() => boardReplies.id, { onDelete: 'cascade' }),
  type: text('type').notNull().default('like'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.replyId] }),
  replyIdIdx: index('idx_board_reply_votes_reply_id').on(t.replyId),
}));

// Site-wide chat
export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedBy: text('deleted_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  createdAtIdx: index('idx_chat_messages_created_at').on(t.createdAt.desc()),
  userIdIdx: index('idx_chat_messages_user_id').on(t.userId),
}));

export const userModeration = pgTable('user_moderation', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  isChatMuted: boolean('is_chat_muted').notNull().default(false),
  mutedUntil: timestamp('muted_until', { withTimezone: true }),
  mutedReason: text('muted_reason'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Manga Import Progress (for real-time progress tracking)
export const importStatusEnum = pgEnum('import_status', ['scanning', 'downloading', 'completed', 'failed', 'source_set']);
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

export const importRequestStatusEnum = pgEnum('import_request_status', ['pending', 'in_progress', 'completed', 'rejected']);

export const importRequests = pgTable('import_requests', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  seriesId: integer('series_id').references(() => series.id, { onDelete: 'set null' }),
  requestedTitle: text('requested_title').notNull(),
  requestedUrl: text('requested_url'),
  notes: text('notes'),
  adminNotes: text('admin_notes'),
  status: importRequestStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  statusIdx: index('idx_import_requests_status').on(t.status),
  userIdIdx: index('idx_import_requests_user_id').on(t.userId),
  createdAtIdx: index('idx_import_requests_created_at').on(t.createdAt.desc()),
}));

// Archive ingestion (torrent) acquisition jobs — one row per series-level archive
// acquisition attempt. Tracks the long-running torrent lifecycle outside BullMQ
// (a job submits + persists a handle and returns; a poller advances the state).
// See docs/archive-ingestion-plan.md §7.
export const acquisitionJobStatusEnum = pgEnum('acquisition_job_status', [
  'searching',
  'downloading',
  'downloaded',
  'ingesting',
  'done',
  'failed',
  'needs_review',
]);

export const acquisitionJobProtocolEnum = pgEnum('acquisition_job_protocol', ['torrent']);

export const acquisitionJobs = pgTable('acquisition_jobs', {
  id: serial('id').primaryKey(),
  seriesId: integer('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  protocol: acquisitionJobProtocolEnum('protocol').notNull().default('torrent'),
  indexer: text('indexer'),
  candidateTitle: text('candidate_title'),
  // Stable hash of the chosen candidate (e.g. magnet/infohash) — dedupes re-attempts
  // for the same series (plan §11.2: one acquisition per series in v1).
  candidateHash: text('candidate_hash'),
  downloadUri: text('download_uri'),
  // External download-client handle (qBittorrent infohash) the poller queries.
  clientHandle: text('client_handle'),
  status: acquisitionJobStatusEnum('status').notNull().default('searching'),
  localPath: text('local_path'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  chaptersIngested: integer('chapters_ingested').notNull().default(0),
  // Whether to run a scraper gap-fill AFTER a successful ingest, regardless of
  // series status. Set for manual-backfill (operator wants "archive + scrape")
  // and for archive_then_scrape strategies; completed-series initial-imports leave
  // it false (the whole catalog comes from the archive). Read by the ingest handler.
  scrapeAfterIngest: boolean('scrape_after_ingest').notNull().default(false),
  // Parser's best-guess layout for needs_review rows (the v2 dataset).
  layoutGuess: jsonb('layout_guess'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  seriesIdIdx: index('idx_acquisition_jobs_series_id').on(t.seriesId),
  statusIdx: index('idx_acquisition_jobs_status').on(t.status),
  // Dedupe key: at most one acquisition per (series, candidate).
  seriesCandidateUniq: uniqueIndex('idx_acquisition_jobs_series_candidate')
    .on(t.seriesId, t.candidateHash)
    .where(sql`${t.candidateHash} IS NOT NULL`),
}));

export const userNotifications = pgTable('user_notifications', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  linkUrl: text('link_url').notNull(),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index('idx_user_notifications_user_id').on(t.userId),
  userCreatedIdx: index('idx_user_notifications_user_created').on(t.userId, t.createdAt.desc()),
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

export const seriesBookmarksRelations = relations(seriesBookmarks, ({ one }) => ({
  user: one(user, { fields: [seriesBookmarks.userId], references: [user.id] }),
  series: one(series, { fields: [seriesBookmarks.seriesId], references: [series.id] }),
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
  chapter: one(chapters, {
    fields: [comments.chapterId],
    references: [chapters.id],
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

export const curatedListsRelations = relations(curatedLists, ({ one, many }) => ({
  author: one(user, { fields: [curatedLists.userId], references: [user.id] }),
  items: many(curatedListItems),
  votes: many(curatedListVotes),
  saves: many(curatedListSaves),
  comments: many(curatedListComments),
}));

export const curatedListItemsRelations = relations(curatedListItems, ({ one }) => ({
  list: one(curatedLists, { fields: [curatedListItems.listId], references: [curatedLists.id] }),
  series: one(series, { fields: [curatedListItems.seriesId], references: [series.id] }),
}));

export const curatedListVotesRelations = relations(curatedListVotes, ({ one }) => ({
  list: one(curatedLists, { fields: [curatedListVotes.listId], references: [curatedLists.id] }),
  user: one(user, { fields: [curatedListVotes.userId], references: [user.id] }),
}));

export const curatedListSavesRelations = relations(curatedListSaves, ({ one }) => ({
  list: one(curatedLists, { fields: [curatedListSaves.listId], references: [curatedLists.id] }),
  user: one(user, { fields: [curatedListSaves.userId], references: [user.id] }),
}));

export const curatedListCommentsRelations = relations(curatedListComments, ({ one, many }) => ({
  author: one(user, { fields: [curatedListComments.userId], references: [user.id] }),
  list: one(curatedLists, { fields: [curatedListComments.listId], references: [curatedLists.id] }),
  parent: one(curatedListComments, {
    fields: [curatedListComments.parentId],
    references: [curatedListComments.id],
    relationName: 'curated_list_comment_replies',
  }),
  replies: many(curatedListComments, { relationName: 'curated_list_comment_replies' }),
  votes: many(curatedListCommentLikes),
}));

export const curatedListCommentLikesRelations = relations(curatedListCommentLikes, ({ one }) => ({
  comment: one(curatedListComments, { fields: [curatedListCommentLikes.commentId], references: [curatedListComments.id] }),
  user: one(user, { fields: [curatedListCommentLikes.userId], references: [user.id] }),
}));

export const seriesRelations = relations(series, ({ many }) => ({
  bookmarks: many(seriesBookmarks),
  chapters: many(chapters),
  comments: many(comments),
  reviews: many(reviews),
}));

export const boardPostsRelations = relations(boardPosts, ({ one, many }) => ({
  author: one(user, { fields: [boardPosts.userId], references: [user.id] }),
  votes: many(boardPostVotes),
  replies: many(boardReplies),
}));

export const boardRepliesRelations = relations(boardReplies, ({ one, many }) => ({
  author: one(user, { fields: [boardReplies.userId], references: [user.id] }),
  post: one(boardPosts, { fields: [boardReplies.postId], references: [boardPosts.id] }),
  votes: many(boardReplyVotes),
}));

export const boardPostVotesRelations = relations(boardPostVotes, ({ one }) => ({
  post: one(boardPosts, { fields: [boardPostVotes.postId], references: [boardPosts.id] }),
  user: one(user, { fields: [boardPostVotes.userId], references: [user.id] }),
}));

export const boardReplyVotesRelations = relations(boardReplyVotes, ({ one }) => ({
  reply: one(boardReplies, { fields: [boardReplyVotes.replyId], references: [boardReplies.id] }),
  user: one(user, { fields: [boardReplyVotes.userId], references: [user.id] }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  author: one(user, { fields: [chatMessages.userId], references: [user.id] }),
}));

export const karmaTransactionsRelations = relations(karmaTransactions, ({ one }) => ({
  user: one(user, { fields: [karmaTransactions.userId], references: [user.id] }),
}));

export const userNotificationsRelations = relations(userNotifications, ({ one }) => ({
  user: one(user, { fields: [userNotifications.userId], references: [user.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(user, { fields: [auditLogs.actorId], references: [user.id] }),
  targetUser: one(user, { fields: [auditLogs.targetUserId], references: [user.id] }),
}));

export const profileWallPostsRelations = relations(profileWallPosts, ({ one, many }) => ({
  wallUser: one(user, { fields: [profileWallPosts.wallUserId], references: [user.id], relationName: 'wallPosts' }),
  author: one(user, { fields: [profileWallPosts.authorUserId], references: [user.id], relationName: 'authoredWallPosts' }),
  parent: one(profileWallPosts, { fields: [profileWallPosts.parentId], references: [profileWallPosts.id], relationName: 'wallPostReplies' }),
  votes: many(profileWallPostVotes),
}));

export const profileWallPostVotesRelations = relations(profileWallPostVotes, ({ one }) => ({
  post: one(profileWallPosts, { fields: [profileWallPostVotes.postId], references: [profileWallPosts.id] }),
  user: one(user, { fields: [profileWallPostVotes.userId], references: [user.id] }),
}));

export const userFavoriteSeriesRelations = relations(userFavoriteSeries, ({ one }) => ({
  user: one(user, { fields: [userFavoriteSeries.userId], references: [user.id] }),
  series: one(series, { fields: [userFavoriteSeries.seriesId], references: [series.id] }),
}));

export const userFollowsRelations = relations(userFollows, ({ one }) => ({
  follower: one(user, { fields: [userFollows.followerId], references: [user.id], relationName: 'userFollowsAsFollower' }),
  following: one(user, { fields: [userFollows.followingId], references: [user.id], relationName: 'userFollowsAsFollowing' }),
}));