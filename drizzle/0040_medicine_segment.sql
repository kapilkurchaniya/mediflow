-- Migration 0040: Medicine target segment (general | male | female | kids | senior)
ALTER TABLE "medicines" ADD COLUMN IF NOT EXISTS "target_segment" text DEFAULT 'general' NOT NULL;
CREATE INDEX IF NOT EXISTS "medicines_tenant_segment_idx" ON "medicines" ("tenant_id", "target_segment");
