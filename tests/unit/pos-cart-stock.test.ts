import { describe, it, expect } from "vitest";
import { posCartReducer, initialPosState } from "@/app/dashboard/sales/pos/_state/usePosCart";
import type { SearchResultMedicine, SearchResultBatch } from "@/app/dashboard/sales/pos/_data/posData";

const medStrip: SearchResultMedicine = {
  id: "med-1",
  name: "Paracetamol 500mg",
  genericName: "Paracetamol",
  unitsPerPack: 10,
  packUnit: "strip",
  looseUnit: "tablet",
  gstRateBp: 1200,
  rxRequired: false,
  schedule: null,
};

const partialBatch: SearchResultBatch = {
  id: "batch-1",
  batchNo: "PCM01",
  expiryDate: "2027-12-31",
  mrp: 5000,
  saleRate: 4500,
  qtyOnHand: 4, // less than 10 unitsPerPack
};

describe("POS Cart Stock Limit & Partial-Strip Rules", () => {
  it("adds loose units instead of 1 full pack when available stock is below unitsPerPack", () => {
    const next = posCartReducer(initialPosState, {
      type: "ADD_LINE",
      payload: { medicine: medStrip, batch: partialBatch, allBatches: [partialBatch] },
    });

    expect(next.cart).toHaveLength(1);
    expect(next.cart[0].packQty).toBe(0);
    expect(next.cart[0].looseQty).toBe(4);
    expect(next.cart[0].qty).toBe(4);
  });

  it("caps line quantity cleanly to maxUnits on CAP_LINE_TO_MAX", () => {
    const added = posCartReducer(initialPosState, {
      type: "ADD_LINE",
      payload: {
        medicine: medStrip,
        batch: { ...partialBatch, qtyOnHand: 25 },
        allBatches: [{ ...partialBatch, qtyOnHand: 25 }],
      },
    });
    const over = posCartReducer(added, {
      type: "UPDATE_LINE_PACK_QTY",
      payload: { batchId: "batch-1", packQty: 5 },
    });
    expect(over.cart[0].qty).toBe(50);

    const capped = posCartReducer(over, {
      type: "CAP_LINE_TO_MAX",
      payload: { batchId: "batch-1", maxUnits: 25 },
    });
    expect(capped.cart[0].packQty).toBe(2);
    expect(capped.cart[0].looseQty).toBe(5);
    expect(capped.cart[0].qty).toBe(25);
  });
});

