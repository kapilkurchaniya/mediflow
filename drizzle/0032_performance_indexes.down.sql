-- Rollback script for Phase 6.2 (0032_performance_indexes.sql)
DROP INDEX IF EXISTS "sale_items_tenant_med_sale_idx";
DROP INDEX IF EXISTS "sales_tenant_store_status_created_idx";
DROP INDEX IF EXISTS "sales_tenant_store_completed_idx";
DROP INDEX IF EXISTS "stock_mov_tenant_store_batch_effective_idx";
DROP INDEX IF EXISTS "batches_store_med_active_idx";
