import type { PosCartLine, SelectedCustomer, ComplianceState, SplitPayments } from "@/app/dashboard/sales/pos/_state/types";

export interface CartIdentity {
  tenantId?: string | null;
  storeId?: string | null;
  userId?: string | null;
  terminalId?: string | null;
}

export interface PersistedDraftCart {
  version: 1;
  storageKey: string;
  updatedAt: number;
  lines: PosCartLine[];
  customer: SelectedCustomer | null;
  compliance: ComplianceState;
  splitPayments: SplitPayments;
  paymentMethod: string;
  redeemPoints: number;
}

export type DraftCartPayload = Omit<PersistedDraftCart, "version" | "storageKey" | "updatedAt">;

const DB_NAME = "mediflow_pos_draft_carts";
const STORE_NAME = "drafts";
const DB_VERSION = 1;
const MAX_DRAFT_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function buildCartStorageKey(identity: CartIdentity = {}): string {
  const tenant = identity.tenantId?.trim() || "default";
  const store = identity.storeId?.trim() || "default";
  const user = identity.userId?.trim() || "default";
  const term = identity.terminalId?.trim() || "default";
  return `mediflow_cart:tenant=${encodeURIComponent(tenant)}:store=${encodeURIComponent(store)}:user=${encodeURIComponent(user)}:term=${encodeURIComponent(term)}`;
}

export function validateAndSanitizeDraft(raw: unknown): PersistedDraftCart | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const updatedAt = typeof obj.updatedAt === "number" ? obj.updatedAt : Number(obj.updatedAt);
  if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > MAX_DRAFT_AGE_MS) {
    return null; // Expired or missing timestamp
  }

  if (!Array.isArray(obj.lines)) return null;

  const sanitizedLines: PosCartLine[] = [];
  for (const item of obj.lines) {
    if (!item || typeof item !== "object") continue;
    const l = item as Record<string, unknown>;
    const batchId = typeof l.batchId === "string" ? l.batchId.trim() : "";
    const medicineId = typeof l.medicineId === "string" ? l.medicineId.trim() : "";
    const medicineName = typeof l.medicineName === "string" ? l.medicineName.trim() : "";
    if (!batchId || !medicineId || !medicineName) continue;

    const packQty = Math.max(0, Math.floor(Number(l.packQty) || 0));
    const looseQty = Math.max(0, Math.floor(Number(l.looseQty) || 0));
    const unitsPerPack = Math.max(1, Math.floor(Number(l.unitsPerPack) || 1));
    const totalQty = Math.max(1, Math.floor(Number(l.qty) || packQty * unitsPerPack + looseQty));

    sanitizedLines.push({
      batchId,
      medicineId,
      medicineName,
      genericName: typeof l.genericName === "string" ? l.genericName : null,
      batchNo: typeof l.batchNo === "string" ? l.batchNo : "DEFAULT",
      expiryDate: typeof l.expiryDate === "string" ? l.expiryDate : "",
      mrp: Math.max(0, Math.floor(Number(l.mrp) || 0)),
      saleRate: Math.max(0, Math.floor(Number(l.saleRate ?? l.mrp) || 0)),
      packQty,
      looseQty,
      qty: totalQty,
      unitsPerPack,
      packUnit: typeof l.packUnit === "string" ? l.packUnit : "strip",
      looseUnit: typeof l.looseUnit === "string" ? l.looseUnit : "tablet",
      qtyOnHand: Math.floor(Number(l.qtyOnHand) || 0),
      discountBp: Math.min(10000, Math.max(0, Math.floor(Number(l.discountBp) || 0))),
      gstRateBp: Math.min(2800, Math.max(0, Math.floor(Number(l.gstRateBp) || 0))),
      rxRequired: Boolean(l.rxRequired),
      schedule: typeof l.schedule === "string" ? l.schedule : null,
      schemeText: typeof l.schemeText === "string" ? l.schemeText : undefined,
      autoFefo: l.autoFefo !== false,
      overrideBatch: Boolean(l.overrideBatch),
      overrideReason: typeof l.overrideReason === "string" ? l.overrideReason : undefined,
    });
  }

  if (sanitizedLines.length === 0) return null;

  let customer: SelectedCustomer | null = null;
  if (obj.customer && typeof obj.customer === "object") {
    const c = obj.customer as Record<string, unknown>;
    if (typeof c.id === "string" && typeof c.name === "string") {
      customer = {
        id: c.id, name: c.name, phone: typeof c.phone === "string" ? c.phone : null,
        loyaltyPoints: typeof c.loyaltyPoints === "number" ? c.loyaltyPoints : 0,
        creditLimit: typeof c.creditLimit === "number" ? c.creditLimit : null,
        redeemablePoints: typeof c.redeemablePoints === "number" ? c.redeemablePoints : 0,
        redeemableValuePaise: typeof c.redeemableValuePaise === "number" ? c.redeemableValuePaise : 0,
      };
    }
  }

  const rawComp = (obj.compliance && typeof obj.compliance === "object" ? obj.compliance : {}) as Record<string, unknown>;
  const compliance: ComplianceState = {
    doctorId: typeof rawComp.doctorId === "string" ? rawComp.doctorId : "",
    doctorName: typeof rawComp.doctorName === "string" ? rawComp.doctorName : "",
    doctorRegNo: typeof rawComp.doctorRegNo === "string" ? rawComp.doctorRegNo : "",
    doctorAddress: "", // Data minimization: sensitive address stripped from client storage
    patientAge: typeof rawComp.patientAge === "number" ? rawComp.patientAge : "",
    patientGender: typeof rawComp.patientGender === "string" ? rawComp.patientGender : "male",
    patientAddress: "", // Data minimization: sensitive patient address stripped from client storage
    prescriptionRef: "", // Data minimization: prescription references not persisted in local storage
    prescriptionDate: new Date().toISOString().slice(0, 10),
    medicalRepId: typeof rawComp.medicalRepId === "string" ? rawComp.medicalRepId : "",
  };

  // Restored drafts ALWAYS start tender selection fresh (zero prior authorization or tender carryover)
  const splitPayments: SplitPayments = { cash: "", upi: "", card: "" };
  const paymentMethod = "cash";

  return {
    version: 1, storageKey: typeof obj.storageKey === "string" ? obj.storageKey : "",
    updatedAt, lines: sanitizedLines, customer, compliance, splitPayments, paymentMethod,
    redeemPoints: 0,
  };
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getIDBFactory(): IDBFactory | null {
  if (typeof indexedDB !== "undefined") return indexedDB;
  if (typeof window !== "undefined" && "indexedDB" in window) return window.indexedDB;
  return null;
}

function getFallbackStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

function getIndexedDB(): Promise<IDBDatabase> {
  const factory = getIDBFactory();
  if (!factory) {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "storageKey" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
}

const writeQueues = new Map<string, Promise<unknown>>();
const lastSavedTimestamps = new Map<string, number>();

export async function saveDraftCart(identity: CartIdentity, payload: DraftCartPayload): Promise<boolean> {
  const key = buildCartStorageKey(identity);
  const now = Date.now();
  const lastTime = lastSavedTimestamps.get(key) ?? 0;
  if (now < lastTime) return false;
  lastSavedTimestamps.set(key, now);

  const draft: PersistedDraftCart = {
    version: 1,
    storageKey: key,
    updatedAt: now,
    ...payload,
  };

  const queue = writeQueues.get(key) ?? Promise.resolve();
  const nextWrite = queue.then(async () => {
    if (now < (lastSavedTimestamps.get(key) ?? 0)) return false;
    try {
      const db = await getIndexedDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(draft);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      return true;
    } catch {
      try {
        const storage = getFallbackStorage();
        if (storage) {
          storage.setItem(key, JSON.stringify(draft));
          return true;
        }
      } catch {
        // storage disabled or quota exceeded
      }
      return false;
    }
  });

  writeQueues.set(key, nextWrite.catch(() => false));
  return (await nextWrite) as boolean;
}

export async function loadDraftCart(identity: CartIdentity): Promise<PersistedDraftCart | null> {
  const key = buildCartStorageKey(identity);
  try {
    const db = await getIndexedDB();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (raw) {
      const validated = validateAndSanitizeDraft(raw);
      if (validated) return validated;
      await clearDraftCart(identity);
    }
  } catch {
    // fallback to localStorage
  }

  try {
    const storage = getFallbackStorage();
    if (storage) {
      const item = storage.getItem(key);
      if (item) {
        const parsed = JSON.parse(item);
        const validated = validateAndSanitizeDraft(parsed);
        if (validated) return validated;
        storage.removeItem(key);
      }
    }
  } catch {
    // ignore parse/storage errors
  }

  return null;
}

export async function clearDraftCart(identity: CartIdentity): Promise<boolean> {
  const key = buildCartStorageKey(identity);
  const clearTimestamp = Date.now() + 1000000;
  lastSavedTimestamps.set(key, clearTimestamp);

  const queue = writeQueues.get(key) ?? Promise.resolve();
  const nextClear = queue.then(async () => {
    let idbSuccess = false;
    try {
      const db = await getIndexedDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      idbSuccess = true;
    } catch {
      idbSuccess = false;
    }

    try {
      const storage = getFallbackStorage();
      if (storage) storage.removeItem(key);
    } catch {
      // ignore localStorage errors
    }

    return idbSuccess;
  });

  writeQueues.set(key, nextClear.catch(() => false));
  return (await nextClear) as boolean;
}

export function resetCartPersistenceDb(): void {
  dbPromise = null;
  writeQueues.clear();
  lastSavedTimestamps.clear();
}

