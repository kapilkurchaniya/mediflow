import { describe, it, expect, vi } from "vitest";
import {
  createGstDocumentFromTransfer,
  getTenantGstins,
  buildGstr1Data,
  buildGstr2Data,
  type CreateGstDocumentFromTransferParams,
} from "@/server/domain/gst";
import type { DbOrTx } from "@/server/db";
import { schema } from "@/server/db";

describe("Task B3.4: Per-GSTIN GST & Inter-Store Transfer Invoices", () => {
  const tenantId = "tenant-100";
  const storeA = {
    id: "store-a",
    tenantId,
    name: "MediFlow Mumbai Central",
    gstin: "27GSPTE0985F1Z5", // Maharashtra (27)
    stateCode: "27",
    isActive: true,
  };
  const storeB = {
    id: "store-b",
    tenantId,
    name: "MediFlow Pune Branch",
    gstin: "27GSPTE0985F1Z5", // Same GSTIN (Maharashtra 27)
    stateCode: "27",
    isActive: true,
  };
  const storeC = {
    id: "store-c",
    tenantId,
    name: "MediFlow Bengaluru Indiranagar",
    gstin: "29AAACC1206D1ZM", // Distinct GSTIN & Inter-State (Karnataka 29)
    stateCode: "29",
    isActive: true,
  };
  const storeD = {
    id: "store-d",
    tenantId,
    name: "MediFlow Nagpur Special Clinic",
    gstin: "27AAACC1206D1ZL", // Distinct GSTIN but Intra-State (Maharashtra 27)
    stateCode: "27",
    isActive: true,
  };

  function extractSqlValues(sqlObj: unknown): unknown[] {
    if (!sqlObj || typeof sqlObj !== "object") return [];
    const vals: unknown[] = [];
    const visited = new Set();

    function traverse(node: unknown) {
      if (!node || typeof node !== "object" || visited.has(node)) return;
      visited.add(node);
      if ("value" in node) {
        const v = (node as { value: unknown }).value;
        if (Array.isArray(v)) {
          vals.push(...v);
        } else {
          vals.push(v);
        }
      }
      if ("values" in node) {
        const v = (node as { values: unknown }).values;
        if (Array.isArray(v)) {
          vals.push(...v);
        }
      }
      for (const key of Object.keys(node)) {
        const child = (node as Record<string, unknown>)[key];
        if (child && typeof child === "object") {
          traverse(child);
        }
      }
    }

    traverse(sqlObj);
    return vals;
  }

  function createMockDb(insertedDocs: Array<typeof schema.gstDocuments.$inferInsert> = []) {
    const storesMap = new Map([
      [storeA.id, storeA],
      [storeB.id, storeB],
      [storeC.id, storeC],
      [storeD.id, storeD],
    ]);

    const docs = [...insertedDocs];

    const mockDb = {
      select: vi.fn().mockImplementation((selectFields) => ({
        from: vi.fn().mockImplementation((table) => ({
          where: vi.fn().mockImplementation((condition) => {
            const vals = extractSqlValues(condition);

            if (table === schema.stores) {
              // Check if query looks up by store id
              for (const [id, s] of storesMap.entries()) {
                if (vals.includes(id)) {
                  return Promise.resolve([s]);
                }
              }
              // If query filters by gstin
              const matchedStores = Array.from(storesMap.values()).filter((s) => {
                if (s.tenantId !== tenantId) return false;
                if (vals.includes(s.gstin)) return true;
                return false;
              });
              if (matchedStores.length > 0) {
                return Promise.resolve(matchedStores);
              }
              return Promise.resolve(Array.from(storesMap.values()));
            }

            if (table === schema.tenants) {
              return Promise.resolve([
                { gstin: "27GSPTE0985F1Z5", stateCode: "27" },
              ]);
            }

            if (table === schema.gstDocuments) {
              const storeIdsInFilter = [storeA.id, storeB.id, storeC.id, storeD.id].filter((id) => vals.includes(id));
              const refTypesInFilter = ["sale", "return", "purchase", "transfer", "transfer_out", "transfer_in"].filter((t) => vals.includes(t));
              let filtered = storeIdsInFilter.length > 0
                ? docs.filter((d) => storeIdsInFilter.includes(d.storeId))
                : docs;
              if (refTypesInFilter.length > 0) {
                filtered = filtered.filter((d) => d.refType != null && refTypesInFilter.includes(d.refType));
              }
              return {
                orderBy: vi.fn().mockResolvedValue(filtered),
              };
            }

            return Promise.resolve([]);
          }),
        })),
      })),
      insert: vi.fn().mockImplementation((table) => ({
        values: vi.fn().mockImplementation((val) => {
          const doc = {
            id: `doc-${docs.length + 1}`,
            createdAt: new Date(),
            ...val,
          };
          docs.push(doc);
          return {
            returning: vi.fn().mockResolvedValue([doc]),
          };
        }),
      })),
    } as unknown as DbOrTx;

    return { mockDb, docs };
  }

  describe("1. Intra-GSTIN Stock Transfers (Same State / Same GSTIN)", () => {
    it("generates a Delivery Challan with 0 tax under Rule 55 for same-GSTIN transfers", async () => {
      const { mockDb, docs } = createMockDb();

      const params: CreateGstDocumentFromTransferParams = {
        transferId: "tr-001",
        tenantId,
        fromStoreId: storeA.id,
        toStoreId: storeB.id, // same GSTIN (27GSPTE0985F1Z5)
        transferNo: "TR/2026/001",
        transferDate: "2026-10-15",
        lines: [
          {
            medicineId: "med-1",
            medicineName: "Amoxicillin 500mg",
            qty: 50,
            unitCostPaise: 4000, // ₹40.00
            gstRateBp: 1200, // 12%
          },
        ],
      };

      const result = await createGstDocumentFromTransfer(mockDb, params);

      expect(result.kind).toBe("delivery_challan");
      expect(result.eWayBillRequired).toBe(false); // 50 * 40 = ₹2,000 < ₹50,000
      expect(result.totalTaxable).toBe(200000); // 200,000 paise = ₹2,000
      expect(result.totalTax).toBe(0);
      expect(result.grandTotal).toBe(200000);
      expect(result.inwardDoc).toBeNull(); // No separate tax invoice for destination

      expect(result.outwardDoc.docType).toBe("delivery_challan");
      expect(result.outwardDoc.refType).toBe("transfer");
      expect(result.outwardDoc.cgst).toBe(0);
      expect(result.outwardDoc.sgst).toBe(0);
      expect(result.outwardDoc.igst).toBe(0);
      expect(result.outwardDoc.partyName).toBe(storeB.name);

      expect(docs.length).toBe(1);
    });

    it("flags eWayBillRequired = true when Delivery Challan value exceeds ₹50,000", async () => {
      const { mockDb } = createMockDb();

      const params: CreateGstDocumentFromTransferParams = {
        transferId: "tr-002",
        tenantId,
        fromStoreId: storeA.id,
        toStoreId: storeB.id,
        transferNo: "TR/2026/002",
        lines: [
          {
            qty: 1000,
            unitCostPaise: 6000, // ₹60.00 -> 1,000 * 60 = ₹60,000 (6,000,000 paise)
          },
        ],
      };

      const result = await createGstDocumentFromTransfer(mockDb, params);

      expect(result.kind).toBe("delivery_challan");
      expect(result.totalTaxable).toBe(6000000);
      expect(result.eWayBillRequired).toBe(true);
    });
  });

  describe("2. Inter-GSTIN Inter-State Stock Transfers (Distinct Persons, GST Sec 25(4))", () => {
    it("generates B2B Tax Invoice with IGST and creates corresponding inward ITC supply", async () => {
      const { mockDb, docs } = createMockDb();

      const params: CreateGstDocumentFromTransferParams = {
        transferId: "tr-003",
        tenantId,
        fromStoreId: storeA.id, // MH (27)
        toStoreId: storeC.id, // KA (29), different GSTIN
        transferNo: "TR/2026/003",
        lines: [
          {
            medicineId: "med-2",
            medicineName: "Atorvastatin 20mg",
            qty: 100,
            unitCostPaise: 10000, // ₹100.00 -> Taxable = ₹10,000 (1,000,000 paise)
            gstRateBp: 1200, // 12% IGST = ₹1,200 (120,000 paise)
          },
        ],
      };

      const result = await createGstDocumentFromTransfer(mockDb, params);

      expect(result.kind).toBe("tax_invoice");
      expect(result.totalTaxable).toBe(1000000);
      expect(result.totalTax).toBe(120000);
      expect(result.grandTotal).toBe(1120000);

      // 1. Outward Tax Invoice under Store A
      expect(result.outwardDoc.storeId).toBe(storeA.id);
      expect(result.outwardDoc.docType).toBe("invoice");
      expect(result.outwardDoc.refType).toBe("transfer_out");
      expect(result.outwardDoc.supplyType).toBe("B2B");
      expect(result.outwardDoc.partyGstin).toBe(storeC.gstin);
      expect(result.outwardDoc.placeOfSupply).toBe("29-Karnataka");
      expect(result.outwardDoc.igst).toBe(120000);
      expect(result.outwardDoc.cgst).toBe(0);
      expect(result.outwardDoc.sgst).toBe(0);

      // 2. Inward Supply under Store C for ITC claiming in GSTR-2
      expect(result.inwardDoc).not.toBeNull();
      expect(result.inwardDoc!.storeId).toBe(storeC.id);
      expect(result.inwardDoc!.docType).toBe("invoice");
      expect(result.inwardDoc!.refType).toBe("transfer_in");
      expect(result.inwardDoc!.partyGstin).toBe(storeA.gstin);
      expect(result.inwardDoc!.partyName).toBe(storeA.name);
      expect(result.inwardDoc!.igst).toBe(120000);
      expect(result.inwardDoc!.taxableAmount).toBe(1000000);
      expect(result.inwardDoc!.total).toBe(1120000);

      expect(docs.length).toBe(2);
    });
  });

  describe("3. Inter-GSTIN Intra-State Stock Transfers (Distinct registrations in same state)", () => {
    it("splits GST equally into CGST and SGST when stores are in same state but distinct GSTINs", async () => {
      const { mockDb } = createMockDb();

      const params: CreateGstDocumentFromTransferParams = {
        transferId: "tr-004",
        tenantId,
        fromStoreId: storeA.id, // MH (27)
        toStoreId: storeD.id, // MH (27), different GSTIN
        transferNo: "TR/2026/004",
        lines: [
          {
            qty: 200,
            unitCostPaise: 5000, // ₹50.00 -> Taxable = ₹10,000 (1,000,000 paise)
            gstRateBp: 1200, // 12% -> 6% CGST + 6% SGST
          },
        ],
      };

      const result = await createGstDocumentFromTransfer(mockDb, params);

      expect(result.kind).toBe("tax_invoice");
      expect(result.totalTaxable).toBe(1000000);
      expect(result.outwardDoc.cgst).toBe(60000);
      expect(result.outwardDoc.sgst).toBe(60000);
      expect(result.outwardDoc.igst).toBe(0);

      // Inward document also has split CGST + SGST
      expect(result.inwardDoc!.cgst).toBe(60000);
      expect(result.inwardDoc!.sgst).toBe(60000);
      expect(result.inwardDoc!.igst).toBe(0);
    });
  });

  describe("4. GSTR-1 & GSTR-2 Multi-GSTIN Filtering", () => {
    it("aggregates stores sharing a GSTIN and includes transfer_out in GSTR-1 B2B supplies", async () => {
      const insertedDocs = [
        // Outward transfer from Store A (27GSPTE0985F1Z5) to Store C (29AAACC1206D1ZM)
        {
          id: "doc-1",
          tenantId,
          storeId: storeA.id,
          docType: "invoice",
          docNo: "TR/2026/001",
          docDate: "2026-10-10",
          partyGstin: storeC.gstin,
          partyName: storeC.name,
          partyStateCode: "29",
          placeOfSupply: "29-Karnataka",
          supplyType: "B2B",
          isReverseCharge: false,
          taxableAmount: 500000,
          cgst: 0,
          sgst: 0,
          igst: 60000,
          cess: 0,
          total: 560000,
          refType: "transfer_out",
          refId: "tr-001",
          status: "active",
        },
        // Inward supply at Store C (29AAACC1206D1ZM)
        {
          id: "doc-2",
          tenantId,
          storeId: storeC.id,
          docType: "invoice",
          docNo: "TR/2026/001",
          docDate: "2026-10-10",
          partyGstin: storeA.gstin,
          partyName: storeA.name,
          partyStateCode: "27",
          placeOfSupply: "29-Karnataka",
          supplyType: "B2B",
          isReverseCharge: false,
          taxableAmount: 500000,
          cgst: 0,
          sgst: 0,
          igst: 60000,
          cess: 0,
          total: 560000,
          refType: "transfer_in",
          refId: "tr-001",
          status: "active",
        },
      ];

      const { mockDb } = createMockDb(insertedDocs);

      // GSTR-1 for Maharashtra GSTIN
      const gstr1 = await buildGstr1Data(mockDb, {
        tenantId,
        month: 10,
        year: 2026,
        gstin: storeA.gstin,
      });

      expect(gstr1.b2b.length).toBe(1);
      expect(gstr1.b2b[0]?.docNo).toBe("TR/2026/001");
      expect(gstr1.b2b[0]?.partyGstin).toBe(storeC.gstin);
      expect(gstr1.totals.taxable).toBe(500000);
      expect(gstr1.totals.igst).toBe(60000);

      // GSTR-2 for Karnataka GSTIN
      const gstr2 = await buildGstr2Data(mockDb, {
        tenantId,
        month: 10,
        year: 2026,
        gstin: storeC.gstin,
      });

      expect(gstr2.inwardSupplies.length).toBe(1);
      expect(gstr2.inwardSupplies[0]?.docNo).toBe("TR/2026/001");
      expect(gstr2.inwardSupplies[0]?.supplierGstin).toBe(storeA.gstin);
      expect(gstr2.totals.taxable).toBe(500000);
      expect(gstr2.totals.igst).toBe(60000);
      expect(gstr2.totals.totalItc).toBe(60000);
    });
  });

  describe("5. getTenantGstins", () => {
    it("groups stores by GSTIN and aggregates branch names", async () => {
      const { mockDb } = createMockDb();

      const gstins = await getTenantGstins(mockDb, tenantId);

      expect(gstins.length).toBeGreaterThanOrEqual(3);

      const mhGstin = gstins.find((g) => g.gstin === storeA.gstin);
      expect(mhGstin).toBeDefined();
      expect(mhGstin?.stateCode).toBe("27");
      expect(mhGstin?.stateName).toBe("Maharashtra");
      // Both Mumbai and Pune store names are present
      expect(mhGstin?.storeNames).toContain(storeA.name);
      expect(mhGstin?.storeNames).toContain(storeB.name);

      const kaGstin = gstins.find((g) => g.gstin === storeC.gstin);
      expect(kaGstin).toBeDefined();
      expect(kaGstin?.stateCode).toBe("29");
      expect(kaGstin?.stateName).toBe("Karnataka");
      expect(kaGstin?.storeNames).toContain(storeC.name);
    });
  });
});
