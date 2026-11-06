/**
 * MediFlow database schema, split per module so the two developer lanes rarely touch the same file.
 * Add ONE export line here when you add a schema file. See docs/04-database.md.
 *
 * Conventions
 * - Every business table carries tenant_id; store-scoped tables also carry store_id.
 * - Money is stored as integer PAISE (bigint mode "number"; safe up to ~9e15 paise).
 * - Percentages are stored in BASIS POINTS (1200 = 12.00%).
 * - Stock quantities are integers in selling units (strip / bottle / pack).
 * - Stock is never edited directly: every change writes a stock_movements row and updates
 *   batches.qty_on_hand inside the same transaction.
 */
export * from "./platform";
export * from "./catalog";
export * from "./inventory";
export * from "./sales";
export * from "./accounting";
export * from "./purchasing";
export * from "./compliance";
export * from "./gst";
export * from "./crm";
export * from "./comms";
export * from "./banking";
export * from "./ai";
export * from "./import";
export * from "./devices";
export * from "./conflicts";
export * from "./year-end";
export * from "./mobile";
