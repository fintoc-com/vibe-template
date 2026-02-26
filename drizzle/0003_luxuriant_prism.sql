ALTER TABLE "card_applications" ADD COLUMN "rai_approval_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "card_applications" ADD COLUMN "rai_reviewed_by_slack_user_id" text;--> statement-breakpoint
ALTER TABLE "card_applications" ADD COLUMN "rai_reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "card_applications" ADD COLUMN "slack_channel_id" text;--> statement-breakpoint
ALTER TABLE "card_applications" ADD COLUMN "slack_message_ts" text;