import Dexie, { type Table } from "dexie";
import type {
  OfflineMedicine,
  OfflineBatch,
  OfflineCustomer,
  OfflineDoctor,
  OfflineScheme,
  OfflineStoreMedicineSetting,
  OfflineStoreSetting,
  OfflinePendingSale,
  OfflineProvisionalAllocation,
  OfflineNumberBlock,
  OfflineSyncConflict,
  OfflineMetaEntry,
  OfflineDeviceConfig,
} from "./types";

export class PosDB extends Dexie {
  medicines!: Table<OfflineMedicine, string>;
  batches!: Table<OfflineBatch, string>;
  customers!: Table<OfflineCustomer, string>;
  doctors!: Table<OfflineDoctor, string>;
  schemes!: Table<OfflineScheme, string>;
  storeMedicineSettings!: Table<OfflineStoreMedicineSetting, string>;
  storeSettings!: Table<OfflineStoreSetting, string>;
  pendingSales!: Table<OfflinePendingSale, string>;
  provisionalAllocations!: Table<OfflineProvisionalAllocation, string>;
  numberBlocks!: Table<OfflineNumberBlock, string>;
  syncConflicts!: Table<OfflineSyncConflict, string>;
  meta!: Table<OfflineMetaEntry, string>;

  constructor(dbName = "mediflow-pos") {
    super(dbName);
    this.version(1).stores({
      medicines: "id, tenantId, [tenantId+isActive], barcode, name, genericName",
      batches: "id, storeId, medicineId, [storeId+medicineId], [storeId+isActive], expiryDate",
      customers: "id, tenantId, [tenantId+isActive], phone, name",
      doctors: "id, tenantId, [tenantId+isActive], name",
      schemes: "id, storeId, tenantId, [storeId+isActive]",
      storeMedicineSettings: "id, storeId, medicineId, [storeId+medicineId]",
      storeSettings: "id, storeId",
      pendingSales: "clientSaleId, storeId, deviceId, status, [storeId+status], createdAt, nextRetryAt",
      provisionalAllocations: "id, storeId, batchId, [storeId+batchId], clientSaleId",
      numberBlocks: "id, storeId, deviceId, fiscalYear, [storeId+deviceId+active]",
      syncConflicts: "id, storeId, deviceId, clientSaleId, resolvedAt, createdAt",
      meta: "key",
    });
  }

  async getMeta<T>(key: string): Promise<T | null> {
    const row = await this.meta.get(key);
    return row ? (row.value as T) : null;
  }

  async setMeta<T>(key: string, value: T): Promise<void> {
    await this.meta.put({ key, value });
  }

  async getDeviceConfig(): Promise<OfflineDeviceConfig | null> {
    return this.getMeta<OfflineDeviceConfig>("deviceConfig");
  }

  async setDeviceConfig(config: OfflineDeviceConfig): Promise<void> {
    await this.setMeta("deviceConfig", config);
  }
}

let posDbInstance: PosDB | null = null;

export function getPosDb(dbName = "mediflow-pos"): PosDB {
  if (!posDbInstance) {
    posDbInstance = new PosDB(dbName);
    if (typeof window !== "undefined") {
      (window as unknown as { __posDb?: PosDB }).__posDb = posDbInstance;
    }
  }
  return posDbInstance;
}

export const getPosDB = getPosDb;

export async function resetPosDb(db?: PosDB): Promise<void> {
  const instance = db ?? posDbInstance;
  if (instance) {
    instance.close();
    await instance.delete();
  }
  if (!db || db === posDbInstance) {
    posDbInstance = null;
  }
}
