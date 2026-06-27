ALTER TABLE "acquisition_jobs" ADD COLUMN "progress" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "acquisition_jobs" ADD COLUMN "last_progress_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "acquisition_jobs" ADD COLUMN "dismissed_at" timestamp with time zone;