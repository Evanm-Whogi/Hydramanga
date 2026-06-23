CREATE TYPE "public"."acquisition_job_protocol" AS ENUM('torrent');--> statement-breakpoint
CREATE TYPE "public"."acquisition_job_status" AS ENUM('searching', 'downloading', 'downloaded', 'ingesting', 'done', 'failed', 'needs_review');--> statement-breakpoint
CREATE TABLE "acquisition_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"series_id" integer NOT NULL,
	"protocol" "acquisition_job_protocol" DEFAULT 'torrent' NOT NULL,
	"indexer" text,
	"candidate_title" text,
	"candidate_hash" text,
	"download_uri" text,
	"client_handle" text,
	"status" "acquisition_job_status" DEFAULT 'searching' NOT NULL,
	"local_path" text,
	"size_bytes" bigint,
	"chapters_ingested" integer DEFAULT 0 NOT NULL,
	"layout_guess" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acquisition_jobs" ADD CONSTRAINT "acquisition_jobs_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_acquisition_jobs_series_id" ON "acquisition_jobs" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "idx_acquisition_jobs_status" ON "acquisition_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_acquisition_jobs_series_candidate" ON "acquisition_jobs" USING btree ("series_id","candidate_hash") WHERE "acquisition_jobs"."candidate_hash" IS NOT NULL;