CREATE TABLE "source_documents" (
	"storage_key" text PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
