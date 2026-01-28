CREATE TABLE "examples" (
	"id" serial PRIMARY KEY NOT NULL,
	"field" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
