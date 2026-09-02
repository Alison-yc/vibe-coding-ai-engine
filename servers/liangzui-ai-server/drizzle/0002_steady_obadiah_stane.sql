ALTER TABLE "documents" ADD COLUMN "source_bytes" "bytea";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "split_chunks" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "embedded_chunks" jsonb;