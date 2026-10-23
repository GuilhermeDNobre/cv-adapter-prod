ALTER TYPE "public"."writing_method" ADD VALUE 'free';--> statement-breakpoint
CREATE TABLE "certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"career_profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"issuer" text,
	"year" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"career_profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"level" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_section_skills" (
	"section_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	CONSTRAINT "resume_section_skills_section_id_skill_id_pk" PRIMARY KEY("section_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"career_profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"group" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_imports" ADD COLUMN "writing_style" jsonb;--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_career_profile_id_career_profiles_id_fk" FOREIGN KEY ("career_profile_id") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "languages" ADD CONSTRAINT "languages_career_profile_id_career_profiles_id_fk" FOREIGN KEY ("career_profile_id") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_section_skills" ADD CONSTRAINT "resume_section_skills_section_id_resume_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."resume_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_section_skills" ADD CONSTRAINT "resume_section_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_career_profile_id_career_profiles_id_fk" FOREIGN KEY ("career_profile_id") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skills_profile_lower_name_unique" ON "skills" USING btree ("career_profile_id",lower("name"));--> statement-breakpoint
UPDATE "contact_details" SET "links" = (SELECT jsonb_agg(CASE WHEN jsonb_typeof(elem) = 'string' THEN jsonb_build_object('title', NULL, 'url', elem #>> '{}') ELSE elem END) FROM jsonb_array_elements("links") AS elem) WHERE "links" IS NOT NULL AND jsonb_typeof("links") = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements("links") AS e WHERE jsonb_typeof(e) = 'string');