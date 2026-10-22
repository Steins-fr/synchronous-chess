CREATE TABLE "connections" (
	"connection_id" text PRIMARY KEY,
	"room_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_password_attempts" (
	"room_id" text,
	"source_hash" text,
	"attempts" smallint NOT NULL,
	"expires_at" bigint NOT NULL,
	CONSTRAINT "room_password_attempts_pkey" PRIMARY KEY("room_id","source_hash")
);
--> statement-breakpoint
CREATE TABLE "room_players" (
	"room_id" text,
	"player_name" text,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "room_players_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	CONSTRAINT "room_players_pkey" PRIMARY KEY("room_id","player_name")
);
--> statement-breakpoint
CREATE TABLE "room_queue" (
	"room_id" text,
	"player_name" text,
	"connection_id" text NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "room_queue_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	CONSTRAINT "room_queue_pkey" PRIMARY KEY("room_id","player_name")
);
--> statement-breakpoint
CREATE TABLE "room_tokens" (
	"room_id" text,
	"player_name" text,
	"token_hash" text NOT NULL,
	CONSTRAINT "room_tokens_pkey" PRIMARY KEY("room_id","player_name")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY,
	"connection_id" text NOT NULL,
	"host_player" text NOT NULL,
	"max_player" smallint NOT NULL,
	"game" text NOT NULL,
	"created_at" text NOT NULL,
	"name_key" text NOT NULL,
	"password_hash" text,
	"is_private" boolean GENERATED ALWAYS AS (password_hash IS NOT NULL) STORED NOT NULL,
	"expires_at" bigint,
	"lease_until" bigint NOT NULL,
	CONSTRAINT "rooms_max_player" CHECK ("max_player" BETWEEN 1 AND 16),
	CONSTRAINT "rooms_game" CHECK ("game" IN ('chess', 'chat'))
);
--> statement-breakpoint
CREATE INDEX "room_queue_connection" ON "room_queue" ("room_id","connection_id");--> statement-breakpoint
CREATE INDEX "rooms_game_created_at" ON "rooms" ("game","created_at" DESC);--> statement-breakpoint
CREATE INDEX "rooms_name_key_trgm" ON "rooms" USING gin ("name_key" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "rooms_expiry" ON "rooms" (coalesce("expires_at", "lease_until"));--> statement-breakpoint
ALTER TABLE "room_password_attempts" ADD CONSTRAINT "room_password_attempts_room_id_rooms_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_room_id_rooms_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "room_queue" ADD CONSTRAINT "room_queue_room_id_rooms_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "room_tokens" ADD CONSTRAINT "room_tokens_room_id_rooms_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE;