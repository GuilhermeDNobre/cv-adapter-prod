CREATE TYPE "public"."evaluation_failure_reason" AS ENUM('ai_key_rejected', 'ai_balance_exhausted', 'ai_unavailable');--> statement-breakpoint
ALTER TYPE "public"."import_failure_reason" ADD VALUE 'ai_key_rejected';--> statement-breakpoint
ALTER TYPE "public"."import_failure_reason" ADD VALUE 'ai_balance_exhausted';--> statement-breakpoint
ALTER TYPE "public"."import_failure_reason" ADD VALUE 'ai_unavailable';--> statement-breakpoint
CREATE TABLE "deepseek_credentials" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"api_key" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deepseek_credentials_single_row" CHECK ("deepseek_credentials"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "failure_reason" "evaluation_failure_reason";