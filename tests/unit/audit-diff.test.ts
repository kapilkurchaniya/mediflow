import { describe, expect, it } from "vitest";
import { describeChanges } from "@/lib/audit-diff";

describe("describeChanges", () => {
  it("lists only the fields that changed, old -> new", () => {
    expect(describeChanges({ qtyOnHand: 10, batchNo: "A" }, { qtyOnHand: 7, batchNo: "A" })).toEqual([
      { field: "qtyOnHand", from: "10", to: "7" },
    ]);
  });
  it("a create lists every new field with an empty old value", () => {
    expect(describeChanges(null, { name: "Dolo", mrp: 100 })).toEqual([
      { field: "name", from: "—", to: "Dolo" },
      { field: "mrp", from: "—", to: "100" },
    ]);
  });
  it("a delete lists every old field", () => {
    expect(describeChanges({ name: "Dolo" }, null)).toEqual([{ field: "name", from: "Dolo", to: "—" }]);
  });
  it("treats null, undefined and empty string as the same 'nothing'", () => {
    expect(describeChanges({ phone: null }, { phone: "" })).toEqual([]);
  });
  it("shows nested values as JSON and handles plain values", () => {
    expect(describeChanges({ a: { x: 1 } }, { a: { x: 2 } })).toEqual([{ field: "a", from: '{"x":1}', to: '{"x":2}' }]);
    expect(describeChanges("a", "b")).toEqual([{ field: "value", from: "a", to: "b" }]);
    expect(describeChanges(null, null)).toEqual([]);
  });
});
