ALTER TABLE "documents" ADD COLUMN "extracted_text" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "cleaned_text" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "char_count_before" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "char_count_after" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "failed_stage" text;