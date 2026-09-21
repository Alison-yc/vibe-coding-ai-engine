ALTER TABLE "workflow_runs" ADD COLUMN "graph_snapshot" jsonb;--> statement-breakpoint
UPDATE "workflow_runs"
SET "graph_snapshot" = "workflows"."graph"
FROM "workflows"
WHERE "workflow_runs"."workflow_id" = "workflows"."id"
  AND "workflow_runs"."graph_snapshot" IS NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ALTER COLUMN "graph_snapshot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "finished_at" timestamp with time zone;