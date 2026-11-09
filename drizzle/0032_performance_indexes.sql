-- Phase 6.2 (A6.2) Performance Optimization Indexes
-- Ensures fast lookups across 50k medicines, 200k batches, and 1M movements.

-- 1. Partial index on active in-stock batches (bypasses exhausted batches in FEFO & POS search)
CREATE INDEX IF NOT EXISTS "batches_store_med_active_idx" 
ON "batches" ("store_id", "medicine_id", "expiry_date", "id") 
WHERE qty_on_hand > 0;

-- 2. Composite index on stock movements (accelerates valuation & batch ledger history)
CREATE INDEX IF NOT EXISTS "stock_mov_tenant_store_batch_effective_idx" 
ON "stock_movements" ("tenant_id", "store_id", "batch_id", "effective_at");

-- 3. Composite indexes on sales for date-range reporting and completed sales
CREATE INDEX IF NOT EXISTS "sales_tenant_store_completed_idx" 
ON "sales" ("tenant_id", "store_id", "completed_at");

CREATE INDEX IF NOT EXISTS "sales_tenant_store_status_created_idx" 
ON "sales" ("tenant_id", "store_id", "status", "created_at");

-- 4. Composite index on sale_items joining sales by medicine
CREATE INDEX IF NOT EXISTS "sale_items_tenant_med_sale_idx" 
ON "sale_items" ("tenant_id", "medicine_id", "sale_id");
