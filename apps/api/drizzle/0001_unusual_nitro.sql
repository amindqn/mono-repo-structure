CREATE TYPE "public"."media_storage" AS ENUM('database', 'object');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"filename" varchar(180) NOT NULL,
	"content_type" varchar(64) NOT NULL,
	"size" integer NOT NULL,
	"storage" "media_storage" NOT NULL,
	"data" "bytea",
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "media_size_limit" CHECK ("media"."size" > 0 and "media"."size" <= 5242880),
	CONSTRAINT "media_data_consistency" CHECK (("media"."storage" = 'database' and "media"."data" is not null and octet_length("media"."data") = "media"."size") or ("media"."storage" = 'object' and "media"."data" is null))
);
--> statement-breakpoint
CREATE TABLE "refresh_credentials" (
	"hash" varchar(64) PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"bio" varchar(500) DEFAULT '' NOT NULL,
	"avatar_media_id" uuid,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_credentials" ADD CONSTRAINT "refresh_credentials_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_media_id_media_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_owner_recent_idx" ON "media" USING btree ("owner_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "refresh_session_idx" ON "refresh_credentials" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_owner_recent_idx" ON "tasks" USING btree ("owner_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);