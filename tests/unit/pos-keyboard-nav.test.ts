import { describe, it, expect, vi } from "vitest";
import { handleCartRowKey, type CartKeyContext } from "@/app/dashboard/sales/pos/_components/useCartKeyboard";
import type { PosCartLine } from "@/app/dashboard/sales/pos/_state/types";

function makeMockLine(over: Partial<PosCartLine> = {}): PosCartLine {
  return {
    batchId: "batch-1",
    batchNo: "B001",
    expiryDate: "2027-12-31",
    medicineId: "med-1",
    medicineName: "Paracetamol 500mg",
    packUnit: "strip",
    looseUnit: "tablet",
    unitsPerPack: 10,
    mrp: 10000,
    saleRate: 10000,
    qtyOnHand: 50,
    qty: 10,
    packQty: 1,
    looseQty: 0,
    discountBp: 0,
    gstRateBp: 1200,
    autoFefo: true,
    overrideBatch: false,
    ...over,
  };
}

describe("handleCartRowKey", () => {
  function makeContext(over: Partial<CartKeyContext> = {}): CartKeyContext {
    return {
      cart: [makeMockLine({ batchId: "b-1" }), makeMockLine({ batchId: "b-2" })],
      index: 0,
      isInput: false,
      inputType: null,
      onRemoveLine: vi.fn(),
      onUpdatePackQty: vi.fn(),
      onUpdateLooseQty: vi.fn(),
      onFocusSearch: vi.fn(),
      focusRow: vi.fn(),
      focusInput: vi.fn(),
      ...over,
    };
  }

  describe("when focused on row container (not input)", () => {
    it("handles ArrowDown to navigate to next row", () => {
      const ctx = makeContext({ index: 0 });
      const preventDefault = vi.fn();
      const handled = handleCartRowKey({ key: "ArrowDown", preventDefault }, ctx);

      expect(handled).toBe(true);
      expect(preventDefault).toHaveBeenCalled();
      expect(ctx.focusRow).toHaveBeenCalledWith(1);
    });

    it("does not navigate past last row on ArrowDown", () => {
      const ctx = makeContext({ index: 1 });
      const preventDefault = vi.fn();
      handleCartRowKey({ key: "ArrowDown", preventDefault }, ctx);

      expect(preventDefault).toHaveBeenCalled();
      expect(ctx.focusRow).not.toHaveBeenCalled();
    });

    it("handles ArrowUp to navigate to previous row", () => {
      const ctx = makeContext({ index: 1 });
      const preventDefault = vi.fn();
      handleCartRowKey({ key: "ArrowUp", preventDefault }, ctx);

      expect(preventDefault).toHaveBeenCalled();
      expect(ctx.focusRow).toHaveBeenCalledWith(0);
    });

    it("triggers onFocusSearch on ArrowUp from top row", () => {
      const ctx = makeContext({ index: 0 });
      const preventDefault = vi.fn();
      handleCartRowKey({ key: "ArrowUp", preventDefault }, ctx);

      expect(preventDefault).toHaveBeenCalled();
      expect(ctx.onFocusSearch).toHaveBeenCalled();
    });

    it("removes line on Delete and focuses adjacent row", () => {
      const ctx = makeContext({ index: 0 });
      const preventDefault = vi.fn();
      handleCartRowKey({ key: "Delete", preventDefault }, ctx);

      expect(preventDefault).toHaveBeenCalled();
      expect(ctx.onRemoveLine).toHaveBeenCalledWith("b-1");
      expect(ctx.focusRow).toHaveBeenCalledWith(0);
    });

    it("removes line and returns focus to search if last item is deleted", () => {
      const ctx = makeContext({
        cart: [makeMockLine({ batchId: "b-only" })],
        index: 0,
      });
      const preventDefault = vi.fn();
      handleCartRowKey({ key: "Delete", preventDefault }, ctx);

      expect(preventDefault).toHaveBeenCalled();
      expect(ctx.onRemoveLine).toHaveBeenCalledWith("b-only");
      expect(ctx.onFocusSearch).toHaveBeenCalled();
    });

    it("focuses pack input on Enter", () => {
      const ctx = makeContext({ index: 0 });
      const preventDefault = vi.fn();
      handleCartRowKey({ key: "Enter", preventDefault }, ctx);

      expect(preventDefault).toHaveBeenCalled();
      expect(ctx.focusInput).toHaveBeenCalledWith("pack");
    });

    it("increments pack quantity on '+' or '='", () => {
      const ctx = makeContext({
        cart: [makeMockLine({ batchId: "b-1", packQty: 2 })],
        index: 0,
      });
      const preventDefault = vi.fn();
      handleCartRowKey({ key: "+", preventDefault }, ctx);

      expect(preventDefault).toHaveBeenCalled();
      expect(ctx.onUpdatePackQty).toHaveBeenCalledWith("b-1", 3);
    });

    it("decrements pack quantity on '-' or '_'", () => {
      const ctx = makeContext({
        cart: [makeMockLine({ batchId: "b-1", packQty: 2 })],
        index: 0,
      });
      const preventDefault = vi.fn();
      handleCartRowKey({ key: "-", preventDefault }, ctx);

      expect(preventDefault).toHaveBeenCalled();
      expect(ctx.onUpdatePackQty).toHaveBeenCalledWith("b-1", 1);
    });
  });

  describe("when focused inside an editable input", () => {
    it("advances from pack input to loose input on Enter", () => {
      const ctx = makeContext({ isInput: true, inputType: "pack" });
      const preventDefault = vi.fn();
      handleCartRowKey({ key: "Enter", preventDefault }, ctx);

      expect(preventDefault).toHaveBeenCalled();
      expect(ctx.focusInput).toHaveBeenCalledWith("loose");
    });

    it("advances from loose input to search on Enter", () => {
      const ctx = makeContext({ isInput: true, inputType: "loose" });
      const preventDefault = vi.fn();
      handleCartRowKey({ key: "Enter", preventDefault }, ctx);

      expect(preventDefault).toHaveBeenCalled();
      expect(ctx.onFocusSearch).toHaveBeenCalled();
    });

    it("returns focus to row container on Escape", () => {
      const ctx = makeContext({ isInput: true, inputType: "pack", index: 1 });
      const preventDefault = vi.fn();
      handleCartRowKey({ key: "Escape", preventDefault }, ctx);

      expect(preventDefault).toHaveBeenCalled();
      expect(ctx.focusRow).toHaveBeenCalledWith(1);
    });

    it("increments looseQty when '+' is pressed in loose input", () => {
      const ctx = makeContext({
        isInput: true,
        inputType: "loose",
        cart: [makeMockLine({ batchId: "b-1", looseQty: 3 })],
      });
      const preventDefault = vi.fn();
      handleCartRowKey({ key: "+", preventDefault }, ctx);

      expect(preventDefault).toHaveBeenCalled();
      expect(ctx.onUpdateLooseQty).toHaveBeenCalledWith("b-1", 4);
    });

    it("decrements looseQty when '-' is pressed in loose input", () => {
      const ctx = makeContext({
        isInput: true,
        inputType: "loose",
        cart: [makeMockLine({ batchId: "b-1", looseQty: 3 })],
      });
      const preventDefault = vi.fn();
      handleCartRowKey({ key: "-", preventDefault }, ctx);

      expect(preventDefault).toHaveBeenCalled();
      expect(ctx.onUpdateLooseQty).toHaveBeenCalledWith("b-1", 2);
    });
  });
});
