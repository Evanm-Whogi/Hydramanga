DROP TABLE "announcements" CASCADE;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "guest_reading_enabled" boolean DEFAULT false NOT NULL;