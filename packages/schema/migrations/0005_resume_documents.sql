CREATE TYPE "public"."bullet_status" AS ENUM('assumed', 'suggestion');--> statement-breakpoint
CREATE TYPE "public"."gap_kind" AS ENUM('existence', 'detail');--> statement-breakpoint
CREATE TYPE "public"."resume_generation_status" AS ENUM('ready', 'generating', 'failed');--> statement-breakpoint
CREATE TYPE "public"."resume_kind" AS ENUM('base', 'tailored');--> statement-breakpoint
CREATE TYPE "public"."resume_language" AS ENUM('pt', 'en');--> statement-breakpoint
CREATE TYPE "public"."resume_section_kind" AS ENUM('summary', 'experience', 'education', 'skills', 'custom');--> statement-breakpoint
CREATE TYPE "public"."resume_template" AS ENUM('comfortable', 'dense');--> statement-breakpoint
CREATE TYPE "public"."resume_tone" AS ENUM('formal', 'direct', 'technical');--> statement-breakpoint
CREATE TYPE "public"."writing_method" AS ENUM('star', 'xyz', 'car', 'apr');--> statement-breakpoint
CREATE TABLE "resume_bullets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"evidence_id" uuid,
	"status" "bullet_status" NOT NULL,
	"suggestion_question" text,
	"requirement_id" uuid,
	"gap_kind" "gap_kind",
	"needs_review" boolean DEFAULT false NOT NULL,
	"edited_by_person" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"experience_id" uuid,
	"education_entry_id" uuid,
	"heading" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"pdf" "bytea" NOT NULL,
	"page_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"kind" "resume_section_kind" NOT NULL,
	"title" text,
	"ordinal" integer NOT NULL,
	"undo_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "resume_kind" NOT NULL,
	"name" text NOT NULL,
	"language" "resume_language" NOT NULL,
	"template" "resume_template" NOT NULL,
	"length_target" integer NOT NULL,
	"writing_method" "writing_method" NOT NULL,
	"tone" "resume_tone" NOT NULL,
	"base_resume_id" uuid,
	"job_description_id" uuid,
	"generation_status" "resume_generation_status" NOT NULL,
	"failure_reason" "evaluation_failure_reason",
	"adaptation_plan" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resumes_tailored_requires_job" CHECK ("resumes"."kind" != 'tailored' OR "resumes"."job_description_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "section_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"text" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_bullets" ADD CONSTRAINT "resume_bullets_entry_id_resume_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."resume_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_bullets" ADD CONSTRAINT "resume_bullets_evidence_id_evidences_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_bullets" ADD CONSTRAINT "resume_bullets_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_entries" ADD CONSTRAINT "resume_entries_section_id_resume_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."resume_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_entries" ADD CONSTRAINT "resume_entries_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_entries" ADD CONSTRAINT "resume_entries_education_entry_id_education_entries_id_fk" FOREIGN KEY ("education_entry_id") REFERENCES "public"."education_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_exports" ADD CONSTRAINT "resume_exports_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_sections" ADD CONSTRAINT "resume_sections_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_base_resume_id_resumes_id_fk" FOREIGN KEY ("base_resume_id") REFERENCES "public"."resumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_comments" ADD CONSTRAINT "section_comments_section_id_resume_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."resume_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resume_bullets_entry_id_idx" ON "resume_bullets" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "resume_entries_section_id_idx" ON "resume_entries" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "resume_exports_resume_id_idx" ON "resume_exports" USING btree ("resume_id");--> statement-breakpoint
CREATE INDEX "resume_sections_resume_id_idx" ON "resume_sections" USING btree ("resume_id");--> statement-breakpoint
CREATE INDEX "section_comments_section_id_idx" ON "section_comments" USING btree ("section_id");