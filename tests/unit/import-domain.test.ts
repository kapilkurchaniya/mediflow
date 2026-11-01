import { describe, it, expect, vi } from "vitest";
import { stringSimilarity } from "@/server/domain/import/match";
import { validateImportJob } from "@/server/domain/import";
import type { DbOrTx } from "@/server/db";

describe("Import Matching & Validation Engine (Tasks B4.1 & B4.2)", () => {
  describe("stringSimilarity (Dice Coefficient)", () => {
    it("returns 1.0 for exact matches ignoring case and symbols", () => {
      expect(stringSimilarity("DOLO 650", "dolo 650")).toBe(1.0);
      expect(stringSimilarity("AUGMENTIN 625 DUO", "Augmentin-625 Duo")).toBe(1.0);
    });

    it("calculates high similarity for minor brand/salt variations", () => {
      const sim = stringSimilarity("PARACETAMOL 650MG", "PARACETAMOL 650");
      expect(sim).toBeGreaterThan(0.75);

      const sim2 = stringSimilarity("CALPOL 500 TABLET", "CALPOL 500 MG TABLET");
      expect(sim2).toBeGreaterThan(0.70);
    });

    it("returns low similarity for completely distinct medicines", () => {
      const sim = stringSimilarity("DOLO 650", "AZITHRAL 500");
      expect(sim).toBeLessThan(0.3);
    });
  });

  describe("validateImportJob logic", () => {
    it("validates and normalizes medicine rows and catches missing required fields", async () => {
      const stagedRows = [
        {
          id: "row-1",
          raw: {
            "ITEM NAME": "DOLO 650 TABLET",
            PACKING: "15 TAB",
            COMPANY: "MICRO LABS",
            HSN: "300490",
            "GST%": "12.00",
            MRP: "34.00",
            RATE: "28.50",
            COST: "25.40",
            RACK: "R1-A",
          },
          status: "pending",
        },
        {
          id: "row-2",
          raw: {
            "ITEM NAME": "", // Missing name
            PACKING: "10 TAB",
            MRP: "abc", // Invalid MRP
          },
          status: "pending",
        },
      ];

      const mockJob = {
        id: "job-1",
        tenantId: "tenant-1",
        entity: "medicines",
        status: "mapped",
        mapping: {
          "ITEM NAME": "name",
          PACKING: "packaging",
          COMPANY: "manufacturerName",
          HSN: "hsn",
          "GST%": "gstRate",
          MRP: "mrp",
          RATE: "saleRate",
          COST: "purchaseCost",
          RACK: "rackLocation",
        },
        totals: { rows: 2, valid: 0, errors: 0, created: 0, updated: 0, skipped: 0 },
      };

      const updatedRows: Record<string, unknown>[] = [];
      const updatedJobs: Record<string, unknown>[] = [];

      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockResolvedValue([mockJob]),
              orderBy: vi.fn().mockResolvedValue(stagedRows),
            })),
          })),
        })),
        update: vi.fn().mockImplementation((table) => ({
          set: vi.fn().mockImplementation((values) => ({
            where: vi.fn().mockImplementation(() => ({
              returning: vi.fn().mockResolvedValue([{ ...mockJob, ...values }]),
            })),
          })),
        })),
      } as unknown as DbOrTx;

      const result = await validateImportJob(mockDb, "tenant-1", "job-1");

      expect(result.validCount).toBe(1);
      expect(result.errorCount).toBe(1);
      expect(result.job.totals.rows).toBe(2);
      expect(result.job.totals.valid).toBe(1);
      expect(result.job.totals.errors).toBe(1);
      expect(result.job.status).toBe("validated");
    });
  });
});

