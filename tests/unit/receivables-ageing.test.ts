import { describe, expect, it } from "vitest";
import {
  computeInvoiceDueDate,
  assignAgeingBucket,
} from "@/server/domain/receivables/invoice-balances";
import {
  aggregateInvoiceBuckets,
  computeEmptyBuckets,
} from "@/server/domain/receivables/outstanding";
import type { InvoiceOpenBalance } from "@/server/domain/receivables/types";

describe("Receivables & Credit Control — Unit Tests", () => {
  describe("computeInvoiceDueDate", () => {
    it("computes exact due date by adding creditDays to completedAt", () => {
      const completed = new Date("2026-11-01T10:00:00Z");
      expect(computeInvoiceDueDate(completed, 30)).toBe("2026-12-01");
      expect(computeInvoiceDueDate(completed, 15)).toBe("2026-11-16");
      expect(computeInvoiceDueDate(completed, 0)).toBe("2026-11-01");
    });

    it("handles ISO string dates and negative creditDays gracefully", () => {
      expect(computeInvoiceDueDate("2026-11-10", 7)).toBe("2026-11-17");
      expect(computeInvoiceDueDate("2026-11-10", -5)).toBe("2026-11-10");
    });
  });

  describe("assignAgeingBucket", () => {
    it("correctly buckets overdue and bill-age boundaries", () => {
      // Current / not overdue
      expect(assignAgeingBucket(0)).toBe("current");
      expect(assignAgeingBucket(-5)).toBe("current");

      // 1-30 days
      expect(assignAgeingBucket(1)).toBe("days1to30");
      expect(assignAgeingBucket(15)).toBe("days1to30");
      expect(assignAgeingBucket(30)).toBe("days1to30");

      // 31-60 days
      expect(assignAgeingBucket(31)).toBe("days31to60");
      expect(assignAgeingBucket(45)).toBe("days31to60");
      expect(assignAgeingBucket(60)).toBe("days31to60");

      // 61-90 days
      expect(assignAgeingBucket(61)).toBe("days61to90");
      expect(assignAgeingBucket(75)).toBe("days61to90");
      expect(assignAgeingBucket(90)).toBe("days61to90");

      // 90+ days
      expect(assignAgeingBucket(91)).toBe("over90");
      expect(assignAgeingBucket(150)).toBe("over90");
    });
  });

  describe("aggregateInvoiceBuckets", () => {
    it("accumulates open balances into their respective buckets and calculates total", () => {
      const mockInvoices: InvoiceOpenBalance[] = [
        {
          saleId: "s1",
          invoiceNo: "INV-1",
          completedAt: "2026-11-01",
          storeId: "st1",
          customerId: "c1",
          totalAmount: 100000,
          paidAmount: 0,
          returnedAmount: 0,
          creditAmount: 100000,
          openBalance: 100000,
          dueDate: "2026-12-01",
          daysOverdue: 0,
          daysSinceInvoice: 3,
          bucket: "current",
        },
        {
          saleId: "s2",
          invoiceNo: "INV-2",
          completedAt: "2026-10-15",
          storeId: "st1",
          customerId: "c1",
          totalAmount: 50000,
          paidAmount: 10000,
          returnedAmount: 0,
          creditAmount: 40000,
          openBalance: 40000,
          dueDate: "2026-10-25",
          daysOverdue: 10,
          daysSinceInvoice: 20,
          bucket: "days1to30",
        },
        {
          saleId: "s3",
          invoiceNo: "INV-3",
          completedAt: "2026-09-01",
          storeId: "st1",
          customerId: "c1",
          totalAmount: 80000,
          paidAmount: 0,
          returnedAmount: 0,
          creditAmount: 80000,
          openBalance: 80000,
          dueDate: "2026-09-15",
          daysOverdue: 50,
          daysSinceInvoice: 64,
          bucket: "days31to60",
        },
        {
          saleId: "s4",
          invoiceNo: "INV-4",
          completedAt: "2026-07-01",
          storeId: "st1",
          customerId: "c1",
          totalAmount: 25000,
          paidAmount: 0,
          returnedAmount: 0,
          creditAmount: 25000,
          openBalance: 25000,
          dueDate: "2026-07-15",
          daysOverdue: 112,
          daysSinceInvoice: 126,
          bucket: "over90",
        },
      ];

      const buckets = aggregateInvoiceBuckets(mockInvoices);
      expect(buckets.current).toBe(100000);
      expect(buckets.days1to30).toBe(40000);
      expect(buckets.days31to60).toBe(80000);
      expect(buckets.days61to90).toBe(0);
      expect(buckets.over90).toBe(25000);
      expect(buckets.total).toBe(100000 + 40000 + 80000 + 25000);
    });

    it("returns zeroed buckets when invoice list is empty", () => {
      const empty = aggregateInvoiceBuckets([]);
      expect(empty).toEqual(computeEmptyBuckets());
    });
  });
});
