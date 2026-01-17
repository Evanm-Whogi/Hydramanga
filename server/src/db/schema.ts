import { pgTable, serial, text, timestamp, varchar, integer, uniqueIndex, boolean, jsonb, real, pgEnum, primaryKey, index} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("user"),
  bio: text("bio"),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
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
}));

// User Series List
export const readingStatusEnum = pgEnum('reading_status', ['unread', 'reading', 'finished', 'dropped', 'favorites']);
export const userSeriesList = pgTable('user_series_list', {
  userId: text('user_id').notNull(), 
  seriesId: integer('series_id').notNull().references(() => series.id),
  status: readingStatusEnum('status').default('unread').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.seriesId] }), // A user can only have a specific series in one list
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
});

// Comments
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  seriesId: integer("seriesId").notNull().references(() => series.id, { onDelete: "cascade" }),
  parentId: integer("parentId").references((): any => comments.id, { onDelete: "cascade" }),
  stars: integer("stars"),
  isSpoiler: boolean("isSpoiler").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// Comment Likes
export const commentLikes = pgTable("comment_likes", {
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  commentId: integer("commentId").notNull().references(() => comments.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.commentId] }),
}));


// Chapters Table
export const chapters = pgTable("chapters", {
  id: serial("id").primaryKey(),
  seriesId: integer("series_id").notNull().references(() => series.id, { onDelete: "cascade" }),
  title: text("title"),
  description: text("description"),
  chapterNumber: text("chapter_number").notNull(), 
  volumeNumber: text("volume_number"),
  localPath: text("local_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // Index for fetching a series' chapters quickly
  seriesIdIdx: index("idx_chapters_series_id").on(t.seriesId),
  // Unique constraint to prevent duplicate chapters per series
  unq: uniqueIndex("idx_chapters_series_unique").on(t.seriesId, t.chapterNumber),
}));

// Relationships 
export const chaptersRelations = relations(chapters, ({ one }) => ({
  series: one(series, {
    fields: [chapters.seriesId],
    references: [series.id],
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
  likes: many(commentLikes),
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

export const userSeriesListRelations = relations(userSeriesList, ({ one }) => ({
  series: one(series, {
    fields: [userSeriesList.seriesId],
    references: [series.id],
  }),
}));

export const seriesRelations = relations(series, ({ many }) => ({
  usersTracking: many(userSeriesList),
  chapters: many(chapters),
  comments: many(comments),
}));