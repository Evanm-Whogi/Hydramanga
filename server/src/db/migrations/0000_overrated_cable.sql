CREATE TYPE "public"."bookmark_status" AS ENUM('reading', 'rereading', 'planned', 'completed', 'paused', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."curated_list_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."import_request_status" AS ENUM('pending', 'in_progress', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('scanning', 'downloading', 'completed', 'failed', 'source_set');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"idToken" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"type" varchar(50) DEFAULT 'info',
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" text,
	"impersonator_id" text,
	"actor_role" text DEFAULT 'anonymous' NOT NULL,
	"action" text NOT NULL,
	"category" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"target_user_id" text,
	"method" varchar(10),
	"path" text,
	"status_code" integer,
	"success" boolean DEFAULT true NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_post_votes" (
	"user_id" text NOT NULL,
	"post_id" integer NOT NULL,
	"type" text DEFAULT 'like' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_post_votes_user_id_post_id_pk" PRIMARY KEY("user_id","post_id")
);
--> statement-breakpoint
CREATE TABLE "board_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"category" varchar(32) DEFAULT 'general' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" integer,
	"content" text NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_reply_votes" (
	"user_id" text NOT NULL,
	"reply_id" integer NOT NULL,
	"type" text DEFAULT 'like' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_reply_votes_user_id_reply_id_pk" PRIMARY KEY("user_id","reply_id")
);
--> statement-breakpoint
CREATE TABLE "chapter_view_stats" (
	"chapter_id" integer PRIMARY KEY NOT NULL,
	"total_views" integer DEFAULT 0 NOT NULL,
	"unique_views" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapter_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"chapter_id" integer NOT NULL,
	"series_id" integer NOT NULL,
	"ip_address" text NOT NULL,
	"user_agent" text NOT NULL,
	"user_id" text,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" serial PRIMARY KEY NOT NULL,
	"series_id" integer NOT NULL,
	"title" text,
	"description" text,
	"chapter_number" text NOT NULL,
	"volume_number" text,
	"storage_prefix" text NOT NULL,
	"page_count" integer DEFAULT 0,
	"scraper_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_likes" (
	"userId" text NOT NULL,
	"commentId" integer NOT NULL,
	"type" text DEFAULT 'like' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comment_likes_userId_commentId_pk" PRIMARY KEY("userId","commentId")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"userId" text NOT NULL,
	"seriesId" integer NOT NULL,
	"chapterId" integer,
	"parentId" integer,
	"isSpoiler" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_stickers" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(120),
	"image_url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curated_list_comment_likes" (
	"user_id" text NOT NULL,
	"comment_id" integer NOT NULL,
	"type" text DEFAULT 'like' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curated_list_comment_likes_user_id_comment_id_pk" PRIMARY KEY("user_id","comment_id")
);
--> statement-breakpoint
CREATE TABLE "curated_list_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"parent_id" integer,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curated_list_items" (
	"list_id" integer NOT NULL,
	"series_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curated_list_items_list_id_series_id_pk" PRIMARY KEY("list_id","series_id")
);
--> statement-breakpoint
CREATE TABLE "curated_list_saves" (
	"user_id" text NOT NULL,
	"list_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curated_list_saves_user_id_list_id_pk" PRIMARY KEY("user_id","list_id")
);
--> statement-breakpoint
CREATE TABLE "curated_list_votes" (
	"user_id" text NOT NULL,
	"list_id" integer NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curated_list_votes_user_id_list_id_pk" PRIMARY KEY("user_id","list_id")
);
--> statement-breakpoint
CREATE TABLE "curated_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" varchar(200) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"visibility" "curated_list_visibility" DEFAULT 'public' NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"dislike_count" integer DEFAULT 0 NOT NULL,
	"save_count" integer DEFAULT 0 NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"series_id" integer,
	"requested_title" text NOT NULL,
	"requested_url" text,
	"notes" text,
	"admin_notes" text,
	"status" "import_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "karma_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"amount" integer NOT NULL,
	"source_type" text,
	"source_id" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "karma_transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "list_view_stats" (
	"list_id" integer PRIMARY KEY NOT NULL,
	"total_views" integer DEFAULT 0 NOT NULL,
	"unique_views" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"ip_address" text NOT NULL,
	"user_agent" text NOT NULL,
	"user_id" text,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manga_import_progress" (
	"series_id" integer PRIMARY KEY NOT NULL,
	"total_chapters" integer DEFAULT 0 NOT NULL,
	"downloaded_chapters" integer DEFAULT 0 NOT NULL,
	"status" "import_status" DEFAULT 'scanning' NOT NULL,
	"scraper_id" text,
	"scraper_url" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "manga_view_stats" (
	"series_id" integer PRIMARY KEY NOT NULL,
	"total_views" integer DEFAULT 0 NOT NULL,
	"unique_views" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manga_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"series_id" integer NOT NULL,
	"ip_address" text NOT NULL,
	"user_agent" text NOT NULL,
	"user_id" text,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_wall_post_votes" (
	"user_id" text NOT NULL,
	"post_id" integer NOT NULL,
	"type" text DEFAULT 'like' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_wall_post_votes_user_id_post_id_pk" PRIMARY KEY("user_id","post_id")
);
--> statement-breakpoint
CREATE TABLE "profile_wall_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"wall_user_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"parent_id" integer,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_votes" (
	"userId" text NOT NULL,
	"reviewId" integer NOT NULL,
	"type" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_votes_userId_reviewId_pk" PRIMARY KEY("userId","reviewId")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"rating" integer NOT NULL,
	"userId" text NOT NULL,
	"seriesId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" integer PRIMARY KEY NOT NULL,
	"state" text,
	"merged_with" integer,
	"title" text,
	"native_title" text,
	"romanized_title" text,
	"secondary_titles" jsonb,
	"cover" jsonb,
	"authors" jsonb,
	"search_text" text,
	"artists" jsonb,
	"description" text,
	"note" text,
	"year" integer,
	"status" text,
	"is_licensed" boolean,
	"has_anime" boolean,
	"anime" jsonb,
	"content_rating" text,
	"type" text,
	"rating" real,
	"final_volume" text,
	"final_chapter" text,
	"total_chapters" text,
	"links" jsonb,
	"publishers" jsonb,
	"relationships" jsonb,
	"genres" jsonb,
	"genres_v2" jsonb,
	"tags" jsonb,
	"tags_v2" jsonb,
	"last_updated_at" timestamp with time zone,
	"source" jsonb,
	"weighted_score" real GENERATED ALWAYS AS (((COALESCE("rating", 0) * 0.6) + (((
      COALESCE(("source"->'anilist'->>'rating_normalized')::float, 0) +
      COALESCE(("source"->'anime_planet'->>'rating_normalized')::float, 0) +
      COALESCE(("source"->'anime_news_network'->>'rating_normalized')::float, 0) +
      COALESCE(("source"->'kitsu'->>'rating_normalized')::float, 0) +
      COALESCE(("source"->'manga_updates'->>'rating_normalized')::float, 0) +
      COALESCE(("source"->'my_anime_list'->>'rating_normalized')::float, 0) +
      COALESCE(("source"->'shikimori'->>'rating_normalized')::float, 0)
    ) / 7) * 0.4))) STORED,
	"content_hash" text
);
--> statement-breakpoint
CREATE TABLE "series_bookmarks" (
	"user_id" text NOT NULL,
	"series_id" integer NOT NULL,
	"status" "bookmark_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_bookmarks_user_id_series_id_pk" PRIMARY KEY("user_id","series_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"token" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"impersonatedBy" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"registration_enabled" boolean DEFAULT true NOT NULL,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"maintenance_message" text,
	"import_requests_enabled" boolean DEFAULT true NOT NULL,
	"oauth_google_enabled" boolean DEFAULT true NOT NULL,
	"oauth_discord_enabled" boolean DEFAULT true NOT NULL,
	"welcome_modal_enabled" boolean DEFAULT true NOT NULL,
	"welcome_modal_title" text,
	"welcome_modal_description" text,
	"welcome_modal_body" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"username" text,
	"displayUsername" text,
	"role" text DEFAULT 'user' NOT NULL,
	"bio" text,
	"emailVerified" boolean NOT NULL,
	"image" text DEFAULT 'https://profile-pictures.garage.chit.sh/default.jpg',
	"karma_total" integer DEFAULT 0 NOT NULL,
	"banned" boolean DEFAULT false,
	"banReason" text,
	"banExpires" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"user_id" text NOT NULL,
	"badge_id" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_user_id_badge_id_pk" PRIMARY KEY("user_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "user_chapter_progress" (
	"user_id" text NOT NULL,
	"chapter_id" integer NOT NULL,
	"last_page_number" integer DEFAULT 0 NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_chapter_progress_user_id_chapter_id_pk" PRIMARY KEY("user_id","chapter_id")
);
--> statement-breakpoint
CREATE TABLE "user_favorite_series" (
	"user_id" text NOT NULL,
	"series_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_favorite_series_user_id_series_id_pk" PRIMARY KEY("user_id","series_id")
);
--> statement-breakpoint
CREATE TABLE "user_follows" (
	"follower_id" text NOT NULL,
	"following_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_follows_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id")
);
--> statement-breakpoint
CREATE TABLE "user_moderation" (
	"user_id" text PRIMARY KEY NOT NULL,
	"is_chat_muted" boolean DEFAULT false NOT NULL,
	"muted_until" timestamp with time zone,
	"muted_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link_url" text NOT NULL,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_reading_days" (
	"user_id" text NOT NULL,
	"activity_date" timestamp NOT NULL,
	"source" text DEFAULT 'chapter_read' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_reading_days_user_id_activity_date_pk" PRIMARY KEY("user_id","activity_date")
);
--> statement-breakpoint
CREATE TABLE "user_reading_progress" (
	"user_id" text NOT NULL,
	"series_id" integer NOT NULL,
	"last_chapter_id" integer,
	"last_page_number" integer DEFAULT 0 NOT NULL,
	"total_pages_read" integer DEFAULT 0 NOT NULL,
	"percentage_completed" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_reading_progress_user_id_series_id_pk" PRIMARY KEY("user_id","series_id")
);
--> statement-breakpoint
CREATE TABLE "user_reading_time" (
	"user_id" text NOT NULL,
	"series_id" integer NOT NULL,
	"chapter_id" integer NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_reading_time_user_id_series_id_chapter_id_pk" PRIMARY KEY("user_id","series_id","chapter_id")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"hide_nsfw" boolean DEFAULT false NOT NULL,
	"is_profile_public" boolean DEFAULT true NOT NULL,
	"incognito_mode" boolean DEFAULT false NOT NULL,
	"incognito_chapters_read" integer DEFAULT 0 NOT NULL,
	"profile_visibility" jsonb DEFAULT '{"bio":true,"readingStats":true,"favorites":true,"lists":true,"bookmarks":true,"comments":true,"wall":true,"recentReads":true}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_impersonator_id_user_id_fk" FOREIGN KEY ("impersonator_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_post_votes" ADD CONSTRAINT "board_post_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_post_votes" ADD CONSTRAINT "board_post_votes_post_id_board_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."board_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_posts" ADD CONSTRAINT "board_posts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_posts" ADD CONSTRAINT "board_posts_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_replies" ADD CONSTRAINT "board_replies_post_id_board_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."board_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_replies" ADD CONSTRAINT "board_replies_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_replies" ADD CONSTRAINT "board_replies_parent_id_board_replies_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."board_replies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_replies" ADD CONSTRAINT "board_replies_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_reply_votes" ADD CONSTRAINT "board_reply_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_reply_votes" ADD CONSTRAINT "board_reply_votes_reply_id_board_replies_id_fk" FOREIGN KEY ("reply_id") REFERENCES "public"."board_replies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_view_stats" ADD CONSTRAINT "chapter_view_stats_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_views" ADD CONSTRAINT "chapter_views_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_views" ADD CONSTRAINT "chapter_views_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_views" ADD CONSTRAINT "chapter_views_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_commentId_comments_id_fk" FOREIGN KEY ("commentId") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_seriesId_series_id_fk" FOREIGN KEY ("seriesId") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_chapterId_chapters_id_fk" FOREIGN KEY ("chapterId") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_comments_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_list_comment_likes" ADD CONSTRAINT "curated_list_comment_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_list_comment_likes" ADD CONSTRAINT "curated_list_comment_likes_comment_id_curated_list_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."curated_list_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_list_comments" ADD CONSTRAINT "curated_list_comments_list_id_curated_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."curated_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_list_comments" ADD CONSTRAINT "curated_list_comments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_list_comments" ADD CONSTRAINT "curated_list_comments_parent_id_curated_list_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."curated_list_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_list_comments" ADD CONSTRAINT "curated_list_comments_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_list_items" ADD CONSTRAINT "curated_list_items_list_id_curated_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."curated_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_list_items" ADD CONSTRAINT "curated_list_items_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_list_saves" ADD CONSTRAINT "curated_list_saves_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_list_saves" ADD CONSTRAINT "curated_list_saves_list_id_curated_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."curated_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_list_votes" ADD CONSTRAINT "curated_list_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_list_votes" ADD CONSTRAINT "curated_list_votes_list_id_curated_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."curated_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_lists" ADD CONSTRAINT "curated_lists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_requests" ADD CONSTRAINT "import_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_requests" ADD CONSTRAINT "import_requests_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "karma_transactions" ADD CONSTRAINT "karma_transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_view_stats" ADD CONSTRAINT "list_view_stats_list_id_curated_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."curated_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_views" ADD CONSTRAINT "list_views_list_id_curated_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."curated_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_views" ADD CONSTRAINT "list_views_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_import_progress" ADD CONSTRAINT "manga_import_progress_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_view_stats" ADD CONSTRAINT "manga_view_stats_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_views" ADD CONSTRAINT "manga_views_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_views" ADD CONSTRAINT "manga_views_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_wall_post_votes" ADD CONSTRAINT "profile_wall_post_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_wall_post_votes" ADD CONSTRAINT "profile_wall_post_votes_post_id_profile_wall_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."profile_wall_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_wall_posts" ADD CONSTRAINT "profile_wall_posts_wall_user_id_user_id_fk" FOREIGN KEY ("wall_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_wall_posts" ADD CONSTRAINT "profile_wall_posts_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_wall_posts" ADD CONSTRAINT "profile_wall_posts_parent_id_profile_wall_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."profile_wall_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_reviewId_reviews_id_fk" FOREIGN KEY ("reviewId") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_seriesId_series_id_fk" FOREIGN KEY ("seriesId") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_bookmarks" ADD CONSTRAINT "series_bookmarks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_bookmarks" ADD CONSTRAINT "series_bookmarks_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_chapter_progress" ADD CONSTRAINT "user_chapter_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_chapter_progress" ADD CONSTRAINT "user_chapter_progress_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_series" ADD CONSTRAINT "user_favorite_series_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_series" ADD CONSTRAINT "user_favorite_series_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_following_id_user_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_moderation" ADD CONSTRAINT "user_moderation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reading_days" ADD CONSTRAINT "user_reading_days_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reading_progress" ADD CONSTRAINT "user_reading_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reading_progress" ADD CONSTRAINT "user_reading_progress_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reading_progress" ADD CONSTRAINT "user_reading_progress_last_chapter_id_chapters_id_fk" FOREIGN KEY ("last_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reading_time" ADD CONSTRAINT "user_reading_time_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reading_time" ADD CONSTRAINT "user_reading_time_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reading_time" ADD CONSTRAINT "user_reading_time_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_announcements_published_published_at" ON "announcements" USING btree ("is_published","published_at" DESC NULLS LAST) WHERE "announcements"."is_published" = true;--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor_id" ON "audit_logs" USING btree ("actor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action" ON "audit_logs" USING btree ("action","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_category" ON "audit_logs" USING btree ("category","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_resource" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_target_user_id" ON "audit_logs" USING btree ("target_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_board_post_votes_post_id" ON "board_post_votes" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "idx_board_posts_created_at" ON "board_posts" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_board_posts_user_id" ON "board_posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_board_posts_category" ON "board_posts" USING btree ("category","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_board_replies_post_id" ON "board_replies" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "idx_board_reply_votes_reply_id" ON "board_reply_votes" USING btree ("reply_id");--> statement-breakpoint
CREATE INDEX "idx_chapter_view_stats_total" ON "chapter_view_stats" USING btree ("total_views" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_chapter_view_stats_unique" ON "chapter_view_stats" USING btree ("unique_views" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_chapter_views_chapter_id" ON "chapter_views" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "idx_chapter_views_series_id" ON "chapter_views" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "idx_chapter_views_viewed_at" ON "chapter_views" USING btree ("viewed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_chapter_views_unique" ON "chapter_views" USING btree ("chapter_id","ip_address","user_agent");--> statement-breakpoint
CREATE INDEX "idx_chapters_series_id" ON "chapters" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "idx_chapters_series_created" ON "chapters" USING btree ("series_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_chapters_series_unique" ON "chapters" USING btree ("series_id","chapter_number");--> statement-breakpoint
CREATE INDEX "idx_chapters_volume_number" ON "chapters" USING btree ("volume_number") WHERE "chapters"."volume_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_chapters_scraper_id" ON "chapters" USING btree ("scraper_id") WHERE "chapters"."scraper_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_chat_messages_created_at" ON "chat_messages" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_chat_messages_user_id" ON "chat_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_comment_likes_comment_id" ON "comment_likes" USING btree ("commentId");--> statement-breakpoint
CREATE INDEX "idx_comments_series_id" ON "comments" USING btree ("seriesId");--> statement-breakpoint
CREATE INDEX "idx_comments_user_id" ON "comments" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_comments_series_created_at" ON "comments" USING btree ("seriesId","createdAt" DESC NULLS LAST) WHERE "comments"."parentId" IS NULL AND "comments"."chapterId" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_comments_chapter_created_at" ON "comments" USING btree ("chapterId","createdAt" DESC NULLS LAST) WHERE "comments"."parentId" IS NULL AND "comments"."chapterId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_comments_parent_id" ON "comments" USING btree ("parentId") WHERE "comments"."parentId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_content_stickers_active_sort" ON "content_stickers" USING btree ("is_active","sort_order","id");--> statement-breakpoint
CREATE INDEX "idx_curated_list_comment_likes_comment_id" ON "curated_list_comment_likes" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "idx_curated_list_comments_list_id" ON "curated_list_comments" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "idx_curated_list_comments_user_id" ON "curated_list_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_curated_list_comments_parent_id" ON "curated_list_comments" USING btree ("parent_id") WHERE "curated_list_comments"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_curated_list_items_list_id" ON "curated_list_items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "idx_curated_list_items_series_id" ON "curated_list_items" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "idx_curated_list_saves_list_id" ON "curated_list_saves" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "idx_curated_list_votes_list_id" ON "curated_list_votes" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "idx_curated_lists_user_id" ON "curated_lists" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_curated_lists_user_slug" ON "curated_lists" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "idx_curated_lists_visibility" ON "curated_lists" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "idx_curated_lists_popular" ON "curated_lists" USING btree ("like_count","view_count");--> statement-breakpoint
CREATE INDEX "idx_import_requests_status" ON "import_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_import_requests_user_id" ON "import_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_import_requests_created_at" ON "import_requests" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_karma_transactions_user_id" ON "karma_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_karma_transactions_created_at" ON "karma_transactions" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_list_view_stats_total" ON "list_view_stats" USING btree ("total_views" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_list_views_list_id" ON "list_views" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "idx_list_views_viewed_at" ON "list_views" USING btree ("viewed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_list_views_unique" ON "list_views" USING btree ("list_id","ip_address","user_agent");--> statement-breakpoint
CREATE INDEX "idx_manga_import_progress_status" ON "manga_import_progress" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_manga_import_progress_updated_at" ON "manga_import_progress" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_manga_import_progress_scraper_id" ON "manga_import_progress" USING btree ("scraper_id") WHERE "manga_import_progress"."scraper_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_manga_view_stats_total" ON "manga_view_stats" USING btree ("total_views" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_manga_view_stats_unique" ON "manga_view_stats" USING btree ("unique_views" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_manga_views_series_id" ON "manga_views" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "idx_manga_views_viewed_at" ON "manga_views" USING btree ("viewed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_manga_views_unique" ON "manga_views" USING btree ("series_id","ip_address","user_agent");--> statement-breakpoint
CREATE INDEX "idx_profile_wall_post_votes_post_id" ON "profile_wall_post_votes" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "idx_profile_wall_posts_wall_user_id" ON "profile_wall_posts" USING btree ("wall_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_profile_wall_posts_author_user_id" ON "profile_wall_posts" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "idx_profile_wall_posts_parent_id" ON "profile_wall_posts" USING btree ("parent_id") WHERE "profile_wall_posts"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_review_votes_review_id" ON "review_votes" USING btree ("reviewId");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_reviews_user_series" ON "reviews" USING btree ("userId","seriesId");--> statement-breakpoint
CREATE INDEX "idx_reviews_series_id" ON "reviews" USING btree ("seriesId");--> statement-breakpoint
CREATE INDEX "idx_reviews_series_date" ON "reviews" USING btree ("seriesId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_reviews_user_id" ON "reviews" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_series_content_hash" ON "series" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "idx_series_rating" ON "series" USING btree ("rating" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_series_last_updated" ON "series" USING btree ("last_updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_series_genres" ON "series" USING gin ("genres");--> statement-breakpoint
CREATE INDEX "idx_series_tags" ON "series" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "idx_series_genres_v2" ON "series" USING gin ("genres_v2");--> statement-breakpoint
CREATE INDEX "idx_series_tags_v2" ON "series" USING gin ("tags_v2");--> statement-breakpoint
CREATE INDEX "idx_series_title_trgm" ON "series" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_series_search_text_trgm" ON "series" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_series_filter_logic" ON "series" USING btree ("type","status","rating" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_series_status_rating" ON "series" USING btree ("status","rating" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_series_weighted_score_id" ON "series" USING btree ("weighted_score" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "idx_series_bookmarks_user_id" ON "series_bookmarks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_series_bookmarks_user_status" ON "series_bookmarks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_series_bookmarks_series_id" ON "series_bookmarks" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "idx_user_badges_user_id" ON "user_badges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_chapter_progress_user_id" ON "user_chapter_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_chapter_progress_chapter_id" ON "user_chapter_progress" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "idx_user_chapter_progress_is_read" ON "user_chapter_progress" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "idx_user_favorite_series_user_id" ON "user_favorite_series" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_follows_follower_id" ON "user_follows" USING btree ("follower_id");--> statement-breakpoint
CREATE INDEX "idx_user_follows_following_id" ON "user_follows" USING btree ("following_id");--> statement-breakpoint
CREATE INDEX "idx_user_notifications_user_id" ON "user_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_notifications_user_created" ON "user_notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_user_reading_days_user_id" ON "user_reading_days" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_reading_progress_user_id" ON "user_reading_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_reading_progress_series_id" ON "user_reading_progress" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "idx_user_reading_time_user_id" ON "user_reading_time" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_reading_time_series_id" ON "user_reading_time" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "idx_user_reading_time_chapter_id" ON "user_reading_time" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "idx_user_reading_time_updated_at" ON "user_reading_time" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_user_settings_user_id" ON "user_settings" USING btree ("user_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION series_build_search_text(p_title text, p_native_title text, p_romanized_title text, p_authors jsonb) RETURNS text AS $$
DECLARE
  parts text[] := ARRAY[]::text[];
  author text;
  normalized text;
BEGIN
  IF p_title IS NOT NULL AND btrim(p_title) <> '' THEN
    normalized := lower(replace(replace(p_title, CHR(8217), ''''), CHR(8216), ''''));
    parts := array_append(parts, normalized);
  END IF;
  IF p_romanized_title IS NOT NULL AND btrim(p_romanized_title) <> '' THEN
    normalized := lower(replace(replace(p_romanized_title, CHR(8217), ''''), CHR(8216), ''''));
    parts := array_append(parts, normalized);
  END IF;
  IF p_native_title IS NOT NULL AND btrim(p_native_title) <> '' THEN
    normalized := lower(replace(replace(p_native_title, CHR(8217), ''''), CHR(8216), ''''));
    parts := array_append(parts, normalized);
  END IF;
  IF p_authors IS NOT NULL THEN
    FOR author IN SELECT jsonb_array_elements_text(p_authors)
    LOOP
      IF author IS NOT NULL AND btrim(author) <> '' THEN
        normalized := lower(replace(replace(author, CHR(8217), ''''), CHR(8216), ''''));
        parts := array_append(parts, normalized);
      END IF;
    END LOOP;
  END IF;
  RETURN NULLIF(array_to_string(parts, ' '), '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;--> statement-breakpoint
CREATE OR REPLACE FUNCTION series_search_text_trigger_fn() RETURNS trigger AS $$
BEGIN
  NEW.search_text := series_build_search_text(NEW.title, NEW.native_title, NEW.romanized_title, NEW.authors);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS series_search_text_trigger ON "series";--> statement-breakpoint
CREATE TRIGGER series_search_text_trigger
  BEFORE INSERT OR UPDATE OF title, native_title, romanized_title, authors
  ON "series"
  FOR EACH ROW
  EXECUTE FUNCTION series_search_text_trigger_fn();
