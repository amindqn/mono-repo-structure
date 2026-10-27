CREATE TYPE "public"."task_status" AS ENUM('open', 'done');--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" varchar(120) NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tasks_title_not_blank" CHECK (length(trim("tasks"."title")) > 0)
);
--> statement-breakpoint
CREATE INDEX "tasks_recent_idx" ON "tasks" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);