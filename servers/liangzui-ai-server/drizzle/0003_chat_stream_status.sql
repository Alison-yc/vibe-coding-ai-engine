ALTER TABLE "chat_sessions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "status" text DEFAULT 'complete' NOT NULL;
