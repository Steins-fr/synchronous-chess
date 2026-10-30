ALTER TABLE "room_tokens" ADD COLUMN "browser_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "room_tokens" ADD COLUMN "banned" boolean DEFAULT false NOT NULL;