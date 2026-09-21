ALTER TABLE "chat_inputs" ADD COLUMN "workspace_root" text DEFAULT '.' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_inputs" ADD COLUMN "mode" text DEFAULT 'edit' NOT NULL;