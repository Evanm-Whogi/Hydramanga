CREATE TYPE "public"."catalog_scan_status" AS ENUM('idle', 'running', 'stopping', 'completed');--> statement-breakpoint
CREATE TABLE "catalog_scan_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"status" "catalog_scan_status" DEFAULT 'idle' NOT NULL,
	"next_rank" integer DEFAULT 1 NOT NULL,
	"batch_size" integer DEFAULT 50 NOT NULL,
	"type" text,
	"skip_with_chapters" boolean DEFAULT true NOT NULL,
	"auto_select_source" boolean DEFAULT true NOT NULL,
	"use_archive" boolean DEFAULT true NOT NULL,
	"current_batch_start" integer,
	"current_batch_end" integer,
	"current_batch_series_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_batch_archived_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_catalog_count" integer DEFAULT 0 NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
