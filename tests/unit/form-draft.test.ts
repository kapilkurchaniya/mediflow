import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildDraftKey, readDraft, writeDraft, removeDraft } from "@/lib/useFormDraft";

describe("useFormDraft storage helpers", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
  });

  it("builds consistent scoped draft keys", () => {
    expect(buildDraftKey("central-po")).toBe("mediflow:draft:central-po");
    expect(buildDraftKey("reorder-qty", "store-1")).toBe("mediflow:draft:reorder-qty:store-1");
  });

  it("persists, reads, and removes multi-row draft state", () => {
    const key = buildDraftKey("central-po");
    const payload = {
      supplierId: "sup-123",
      rows: [
        { medicineId: "med-1", medicineName: "Dolo 650", allocations: { "store-1": 10 } },
        { medicineId: "med-2", medicineName: "Atorva 20", allocations: { "store-1": 5 } },
      ],
    };

    writeDraft(key, payload);
    expect(readDraft<typeof payload>(key)).toEqual(payload);

    removeDraft(key);
    expect(readDraft<typeof payload>(key)).toBeNull();
  });

  it("returns null safely when stored JSON is corrupted", () => {
    const key = buildDraftKey("new-po");
    store.set(key, "{bad-json");
    expect(readDraft(key)).toBeNull();
  });
});
