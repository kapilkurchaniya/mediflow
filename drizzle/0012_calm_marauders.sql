ALTER TABLE "stores" ADD COLUMN "kind" text DEFAULT 'retail' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "settings" jsonb DEFAULT '{"requireShift":false,"printFormat":"thermal_80mm","defaultPaymentMethod":"cash"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_kind_check" CHECK ("stores"."kind" IN ('retail', 'warehouse'));