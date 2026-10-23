CREATE TYPE "public"."skill_proposal_kind" AS ENUM('addition', 'swap');--> statement-breakpoint
CREATE TYPE "public"."skill_proposal_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "resume_skill_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"kind" "skill_proposal_kind" NOT NULL,
	"name" text NOT NULL,
	"group" text,
	"replaces_skill_id" uuid,
	"requirement_id" uuid,
	"status" "skill_proposal_status" DEFAULT 'pending' NOT NULL,
	"ordinal" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resume_skill_proposals_swap_requires_skill" CHECK (("resume_skill_proposals"."kind" = 'swap') = ("resume_skill_proposals"."replaces_skill_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "resume_skill_proposals" ADD CONSTRAINT "resume_skill_proposals_section_id_resume_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."resume_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_skill_proposals" ADD CONSTRAINT "resume_skill_proposals_replaces_skill_id_skills_id_fk" FOREIGN KEY ("replaces_skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_skill_proposals" ADD CONSTRAINT "resume_skill_proposals_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resume_skill_proposals_section_lower_name_unique" ON "resume_skill_proposals" USING btree ("section_id",lower("name"));