import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildCartStorageKey,
  validateAndSanitizeDraft,
  saveDraftCart,
  loadDraftCart,
  clearDraftCart,
  resetCartPersistenceDb,
  type DraftCartPayload,
} from "@/lib/pos-cart-persistence";
import { posCartReducer, initialPosState } from "@/app/dashboard/sales/pos/_state/usePosCart";
import type { PosCartLine } from "@/app/dashboard/sales/pos/_state/types";

describe("POS Cart Resilience & Persistence", () => {
  beforeEach(async () => {
    resetCartPersistenceDb();
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  const sampleLine: PosCartLine = {
    batchId: "batch_123",
    medicineId: "med_456",
    medicineName: "Paracetamol 650mg",
    genericName: "Paracetamol",
    batchNo: "PCM-2024",
    expiryDate: "2026-12-31",
    mrp: 3000,
    saleRate: 2700,
    packQty: 2,
    looseQty: 0,
    qty: 20,
    unitsPerPack: 10,
    packUnit: "strip",
    looseUnit: "tablet",
    qtyOnHand: 100,
    discountBp: 500,
    gstRateBp: 1200,
    rxRequired: false,
    autoFefo: true,
  };

  const samplePayload: DraftCartPayload = {
    lines: [sampleLine],
    customer: { id: "cust_1", name: "Rahul Sharma", phone: "9876543210" },
    compliance: {
      doctorId: "doc_1", doctorName: "Dr. A. Verma", doctorRegNo: "MCI-9988", doctorAddress: "123 Clinic Road",
      patientAge: 35, patientGender: "male", patientAddress: "Flat 4, Pune",
      prescriptionRef: "RX-4411", prescriptionDate: "2026-11-07", medicalRepId: "",
    },
    splitPayments: { cash: "500", upi: "40", card: "" },
    paymentMethod: "cash",
    redeemPoints: 50,
  };

  it("constructs composite storage keys preventing multi-store / cashier collision", () => {
    const key1 = buildCartStorageKey({ tenantId: "t1", storeId: "s1", userId: "u1" });
    const key2 = buildCartStorageKey({ tenantId: "t1", storeId: "s2", userId: "u1" });
    const key3 = buildCartStorageKey({ tenantId: "t1", storeId: "s1", userId: "u2", terminalId: "pos_1" });
    const keyDefault = buildCartStorageKey();

    expect(key1).toBe("mediflow_cart:tenant=t1:store=s1:user=u1:term=default");
    expect(key2).toBe("mediflow_cart:tenant=t1:store=s2:user=u1:term=default");
    expect(key3).toBe("mediflow_cart:tenant=t1:store=s1:user=u2:term=pos_1");
    expect(keyDefault).toBe("mediflow_cart:tenant=default:store=default:user=default:term=default");
    expect(key1).not.toBe(key2);
  });

  it("validates and sanitizes untrusted drafts safely with data minimization", () => {
    const valid = validateAndSanitizeDraft({
      updatedAt: Date.now(),
      lines: [sampleLine],
      customer: samplePayload.customer,
      compliance: samplePayload.compliance,
      splitPayments: samplePayload.splitPayments,
      paymentMethod: "cash",
      redeemPoints: 20,
    });

    expect(valid).not.toBeNull();
    expect(valid?.lines).toHaveLength(1);
    expect(valid?.lines[0].medicineName).toBe("Paracetamol 650mg");
    expect(valid?.customer?.name).toBe("Rahul Sharma");
    expect(valid?.compliance.doctorName).toBe("Dr. A. Verma");
    expect(valid?.compliance.doctorAddress).toBe("");
    expect(valid?.compliance.patientAddress).toBe("");
    expect(valid?.compliance.prescriptionRef).toBe("");
  });

  it("rejects expired drafts older than 24 hours", () => {
    const expiredTime = Date.now() - 25 * 60 * 60 * 1000;
    const result = validateAndSanitizeDraft({
      updatedAt: expiredTime,
      lines: [sampleLine],
    });
    expect(result).toBeNull();
  });

  it("filters corrupted lines and rejects drafts without valid items", () => {
    const corruptLine = { batchId: "", medicineName: "" };
    const result = validateAndSanitizeDraft({
      updatedAt: Date.now(),
      lines: [corruptLine, { ...sampleLine, batchId: "b_ok" }],
    });

    expect(result).not.toBeNull();
    expect(result?.lines).toHaveLength(1);
    expect(result?.lines[0].batchId).toBe("b_ok");

    const completelyCorrupt = validateAndSanitizeDraft({
      updatedAt: Date.now(),
      lines: [corruptLine],
    });
    expect(completelyCorrupt).toBeNull();
  });

  it("never persists or restores payment credentials or secrets, and resets tender fresh", () => {
    const draftWithSecrets = {
      updatedAt: Date.now(),
      lines: [sampleLine],
      splitPayments: {
        cash: "100",
        upi: "200",
        card: "300",
        token: "secret_card_token_123",
        authHeader: "Bearer sk_live_999",
      },
    };

    const sanitized = validateAndSanitizeDraft(draftWithSecrets);
    expect(sanitized).not.toBeNull();
    expect(sanitized?.splitPayments).toEqual({ cash: "", upi: "", card: "" });
    expect(sanitized?.paymentMethod).toBe("cash");
    expect(sanitized?.redeemPoints).toBe(0);
    expect(((sanitized?.splitPayments as unknown) as Record<string, unknown>).token).toBeUndefined();
    expect(((sanitized?.splitPayments as unknown) as Record<string, unknown>).authHeader).toBeUndefined();
  });

  it("persists, recovers, and clears draft carts in IndexedDB", async () => {
    const identity = { tenantId: "tenant_alpha", storeId: "store_main", userId: "cashier_1" };

    const saved = await saveDraftCart(identity, samplePayload);
    expect(saved).toBe(true);

    const loaded = await loadDraftCart(identity);
    expect(loaded).not.toBeNull();
    expect(loaded?.lines).toHaveLength(1);
    expect(loaded?.lines[0].batchNo).toBe("PCM-2024");
    expect(loaded?.customer?.name).toBe("Rahul Sharma");
    expect(loaded?.compliance.doctorName).toBe("Dr. A. Verma");

    const cleared = await clearDraftCart(identity);
    expect(cleared).toBe(true);

    const afterClear = await loadDraftCart(identity);
    expect(afterClear).toBeNull();
  });

  it("guarantees serialized save and clear ordering (save-clear race prevention)", async () => {
    const identity = { tenantId: "tenant_racing", storeId: "store_race", userId: "cashier_race" };

    const p1 = saveDraftCart(identity, samplePayload);
    const p2 = clearDraftCart(identity);
    await Promise.all([p1, p2]);

    const loaded = await loadDraftCart(identity);
    expect(loaded).toBeNull();
  });

  it("isolates drafts across different stores and cashiers", async () => {
    const cashier1StoreA = { tenantId: "t1", storeId: "store_a", userId: "user_1" };
    const cashier2StoreA = { tenantId: "t1", storeId: "store_a", userId: "user_2" };
    const cashier1StoreB = { tenantId: "t1", storeId: "store_b", userId: "user_1" };

    await saveDraftCart(cashier1StoreA, samplePayload);

    const loadedOtherCashier = await loadDraftCart(cashier2StoreA);
    expect(loadedOtherCashier).toBeNull();

    const loadedOtherStore = await loadDraftCart(cashier1StoreB);
    expect(loadedOtherStore).toBeNull();

    const loadedSameUserStore = await loadDraftCart(cashier1StoreA);
    expect(loadedSameUserStore).not.toBeNull();
    expect(loadedSameUserStore?.lines[0].medicineId).toBe("med_456");
  });

  it("hydrates draft cart into posCartReducer correctly", () => {
    const state = posCartReducer(initialPosState, {
      type: "HYDRATE_DRAFT_CART",
      payload: samplePayload,
    });

    expect(state.cart).toHaveLength(1);
    expect(state.cart[0].medicineName).toBe("Paracetamol 650mg");
    expect(state.customer?.name).toBe("Rahul Sharma");
    expect(state.compliance.doctorName).toBe("Dr. A. Verma");
    expect(state.splitPayments.cash).toBe("500");
    expect(state.redeemPoints).toBe(50);
  });

  it("clears cart back to initial state on RESET_SALE while preserving soundEnabled", () => {
    const modifiedState = {
      ...initialPosState,
      cart: [sampleLine],
      soundEnabled: false,
    };

    const resetState = posCartReducer(modifiedState, { type: "RESET_SALE" });
    expect(resetState.cart).toHaveLength(0);
    expect(resetState.soundEnabled).toBe(false);
  });
});
