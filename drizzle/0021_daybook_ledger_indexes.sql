CREATE INDEX IF NOT EXISTS "journal_tenant_store_date_idx" ON "journal_entries" USING btree ("tenant_id","store_id","entry_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_lines_tenant_party_idx" ON "journal_lines" USING btree ("tenant_id","party_type","party_id");
