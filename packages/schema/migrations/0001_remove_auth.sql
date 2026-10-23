DROP TABLE "sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "google_sub";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "ai_transfer_consent_at";--> statement-breakpoint
INSERT INTO "users" ("id") VALUES ('00000000-0000-0000-0000-000000000001') ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "job_descriptions" SET "user_id" = '00000000-0000-0000-0000-000000000001' WHERE "user_id" IS NULL;--> statement-breakpoint
DROP INDEX "job_descriptions_guest_token_hash_idx";--> statement-breakpoint
ALTER TABLE "job_descriptions" DROP COLUMN "guest_token_hash";--> statement-breakpoint
ALTER TABLE "job_descriptions" ALTER COLUMN "user_id" SET NOT NULL;
