/**
 * Desktop SQLite Storage Adapter (WAL Mode)
 * Provides local durable persistence for the Tauri desktop POS application,
 * mirroring Dexie IndexedDB sync semantics with sub-millisecond query latency.
 */

import type { OfflineMedicine, OfflineBatch, OfflinePendingSale, OfflineNumberBlock } from "../offline/types";

export interface DesktopStorageDriver {
  exec(sql: string): Promise<void>;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
}

export const SQLITE_WAL_PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA cache_size = -32000;
PRAGMA foreign_keys = ON;
`;

export const SQLITE_SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS desktop_medicines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  generic_name TEXT,
  barcode TEXT,
  schedule TEXT,
  hsn_code TEXT,
  is_active INTEGER DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS desktop_batches (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  medicine_id TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  mrp_paise INTEGER NOT NULL,
  sale_rate_paise INTEGER NOT NULL,
  qty_on_hand INTEGER NOT NULL,
  is_active INTEGER DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS desktop_pending_sales (
  client_sale_id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  invoice_no TEXT NOT NULL,
  fiscal_year TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS desktop_number_blocks (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  fiscal_year TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  store_code TEXT NOT NULL,
  device_code TEXT NOT NULL,
  start_seq INTEGER NOT NULL,
  end_seq INTEGER NOT NULL,
  next_seq INTEGER NOT NULL,
  active INTEGER DEFAULT 1
);
`;

export class MemoryStorageDriver implements DesktopStorageDriver {
  private medicines = new Map<string, OfflineMedicine>();
  private batches = new Map<string, OfflineBatch>();
  private pendingSales = new Map<string, OfflinePendingSale>();
  private numberBlocks = new Map<string, OfflineNumberBlock>();

  async exec(_sql: string): Promise<void> {
    void _sql;
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (sql.includes("FROM desktop_medicines")) {
      const q = String(params[0] || "").toLowerCase();
      const list = Array.from(this.medicines.values()).filter((m) =>
        !q || m.name.toLowerCase().includes(q) || (m.barcode && m.barcode.toLowerCase() === q),
      );
      return list as unknown as T[];
    }
    if (sql.includes("FROM desktop_batches")) {
      const medId = String(params[0]);
      const list = Array.from(this.batches.values()).filter((b) => b.medicineId === medId);
      return list as unknown as T[];
    }
    if (sql.includes("FROM desktop_pending_sales")) {
      return Array.from(this.pendingSales.values()) as unknown as T[];
    }
    if (sql.includes("FROM desktop_number_blocks")) {
      return Array.from(this.numberBlocks.values()) as unknown as T[];
    }
    return [];
  }

  putMedicine(m: OfflineMedicine) { this.medicines.set(m.id, m); }
  putBatch(b: OfflineBatch) { this.batches.set(b.id, b); }
  putPendingSale(s: OfflinePendingSale) { this.pendingSales.set(s.clientSaleId, s); }
  putNumberBlock(nb: OfflineNumberBlock) { this.numberBlocks.set(nb.id, nb); }
  getPendingSale(clientSaleId: string) { return this.pendingSales.get(clientSaleId); }
  clear() {
    this.medicines.clear();
    this.batches.clear();
    this.pendingSales.clear();
    this.numberBlocks.clear();
  }
}

export class DesktopSqliteStorage {
  constructor(private driver: DesktopStorageDriver = new MemoryStorageDriver()) {}

  async initialize(): Promise<void> {
    await this.driver.exec(SQLITE_WAL_PRAGMAS);
    await this.driver.exec(SQLITE_SCHEMA_DDL);
  }

  async ingestCatalog(medicines: OfflineMedicine[], batches: OfflineBatch[]): Promise<void> {
    if (this.driver instanceof MemoryStorageDriver) {
      for (const m of medicines) this.driver.putMedicine(m);
      for (const b of batches) this.driver.putBatch(b);
      return;
    }

    for (const m of medicines) {
      await this.driver.query(
        `INSERT OR REPLACE INTO desktop_medicines (id, tenant_id, name, generic_name, barcode, schedule, hsn_code, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [m.id, m.tenantId, m.name, m.genericName, m.barcode, m.schedule, m.hsnCode, m.isActive ? 1 : 0, m.updatedAt],
      );
    }

    for (const b of batches) {
      await this.driver.query(
        `INSERT OR REPLACE INTO desktop_batches (id, store_id, medicine_id, batch_number, expiry_date, mrp_paise, sale_rate_paise, qty_on_hand, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.id, b.storeId, b.medicineId, b.batchNumber, b.expiryDate, b.mrpPaise, b.saleRatePaise, b.qtyOnHand, b.isActive ? 1 : 0, b.updatedAt],
      );
    }
  }

  async savePendingSale(sale: OfflinePendingSale): Promise<void> {
    if (this.driver instanceof MemoryStorageDriver) {
      this.driver.putPendingSale(sale);
      return;
    }

    await this.driver.query(
      `INSERT OR REPLACE INTO desktop_pending_sales (client_sale_id, store_id, device_id, invoice_no, fiscal_year, sequence_number, status, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sale.clientSaleId, sale.storeId, sale.deviceId, sale.invoiceNo, sale.fiscalYear, sale.sequenceNumber, sale.status, JSON.stringify(sale.payload), sale.createdAt, sale.updatedAt],
    );
  }

  async getPendingSales(): Promise<OfflinePendingSale[]> {
    return await this.driver.query<OfflinePendingSale>("SELECT * FROM desktop_pending_sales WHERE status = 'pending'");
  }

  async markSaleSynced(clientSaleId: string): Promise<void> {
    if (this.driver instanceof MemoryStorageDriver) {
      const sale = this.driver.getPendingSale(clientSaleId);
      if (sale) {
        sale.status = "synced";
      }
      return;
    }

    await this.driver.query("UPDATE desktop_pending_sales SET status = 'synced' WHERE client_sale_id = ?", [clientSaleId]);
  }

  async searchMedicines(query: string): Promise<OfflineMedicine[]> {
    return await this.driver.query<OfflineMedicine>("SELECT * FROM desktop_medicines", [query]);
  }
}
