CREATE TABLE "slack_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"real_name" text NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"text" text NOT NULL,
	"raw_text" text NOT NULL,
	"user_id" text NOT NULL,
	"timestamp" text NOT NULL,
	"datetime" timestamp NOT NULL,
	"type" text NOT NULL,
	"subtype" text,
	"category_role" text NOT NULL,
	"category_group" text NOT NULL,
	"topic" text NOT NULL,
	"topic_color" text NOT NULL,
	"summary" text NOT NULL,
	"archetype" text NOT NULL,
	"archetype_confidence" text NOT NULL,
	"thread_ts" text,
	"is_thread_reply" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_messages" ADD CONSTRAINT "slack_messages_user_id_slack_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."slack_users"("id") ON DELETE no action ON UPDATE no action;