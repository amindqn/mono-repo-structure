CREATE TYPE "public"."email_kind" AS ENUM('verify-email', 'reset-password', 'password-reset-notice');--> statement-breakpoint
CREATE TABLE "action_credentials" (
	"hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "email_kind" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "action_purpose_valid" CHECK ("action_credentials"."purpose" in ('verify-email', 'reset-password'))
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "email_kind" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"lease_id" uuid,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "action_credentials" ADD CONSTRAINT "action_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_user_purpose_idx" ON "action_credentials" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "action_expiry_idx" ON "action_credentials" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "email_outbox" USING btree ("available_at") WHERE "email_outbox"."finished_at" is null;--> statement-breakpoint
CREATE INDEX "outbox_user_kind_idx" ON "email_outbox" USING btree ("user_id","kind","created_at" DESC NULLS LAST);