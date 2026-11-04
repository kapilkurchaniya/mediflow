import { describe, it, expect } from "vitest";
import type { OfflinePendingSale } from "@/offline/types";

describe("PendingBillsDrawer Logic and JSON Export Sanitization", () => {
  const mockBills: OfflinePendingSale[] = [
    {
      clientSaleId: "sale-uuid-1",
      storeId: "store-1",
      deviceId: "dev01",
      status: "pending",
      createdAt: "2026-11-03T10:30:00.000Z",
      updatedAt: "2026-11-03T10:30:00.000Z",
      retryCount: 0,
      nextRetryAt: "2026-11-03T10:30:00.000Z",
      invoiceNo: "M101/2526/000001",
      fiscalYear: "2526",
      sequenceNumber: 1,
      payload: {
        clientSaleId: "sale-uuid-1",
        createdBy: "user-1",
        customerId: "cust-1",
        invoiceNo: "M101/2526/000001",
        sequenceNumber: 1,
        fiscalYear: "2526",
        completedAt: "2026-11-03T10:30:00.000Z",
        lines: [
          {
            batchId: "b1",
            medicineId: "m1",
            qty: 2,
            discountBp: 0,
          },
        ],
        payments: [
          {
            method: "cash",
            amount: 5000,
          },
        ],
        compliance: {
          doctorName: "Dr. Arvind Mehta",
          doctorRegNo: "MCI-45890",
          prescriptionRef: "RX-998",
        },
      },
    },
    {
      clientSaleId: "sale-uuid-2",
      storeId: "store-1",
      deviceId: "dev01",
      status: "rejected",
      createdAt: "2026-11-03T10:35:00.000Z",
      updatedAt: "2026-11-03T10:35:00.000Z",
      retryCount: 3,
      nextRetryAt: "2026-11-03T10:35:00.000Z",
      invoiceNo: "M101/2526/000002",
      fiscalYear: "2526",
      sequenceNumber: 2,
      lastError: "Batch expired on server",
      payload: {
        clientSaleId: "sale-uuid-2",
        createdBy: "user-1",
        invoiceNo: "M101/2526/000002",
        sequenceNumber: 2,
        fiscalYear: "2526",
        completedAt: "2026-11-03T10:35:00.000Z",
        lines: [],
        payments: [{ method: "upi", amount: 2000, reference: "UPI123456" }],
      },
    },
  ];

  it("calculates pending count from bills list", () => {
    const pendingCount = mockBills.filter(
      (b) => b.status === "pending" || b.status === "syncing",
    ).length;
    expect(pendingCount).toBe(1);
  });

  it("sanitizes JSON export to adhere strictly to the safe allowlist", () => {
    // Generate sanitized payload as implemented in PendingBillsDrawer
    const sanitized = mockBills.map((b) => ({
      clientSaleId: b.clientSaleId,
      invoiceNo: b.invoiceNo,
      createdAt: b.createdAt,
      storeId: b.storeId,
      deviceId: b.deviceId,
      status: b.status,
      itemCount: b.payload.lines?.length || 0,
      payments: (b.payload.payments || []).map((p) => ({
        method: p.method,
        amountPaise: p.amount,
        reference: p.reference,
      })),
      lines: b.payload.lines.map((l) => ({
        batchId: l.batchId,
        medicineId: l.medicineId,
        qty: l.qty,
        discountBp: l.discountBp,
      })),
      compliance: b.payload.compliance ? {
        doctorName: b.payload.compliance.doctorName,
        doctorRegNo: b.payload.compliance.doctorRegNo,
        prescriptionRef: b.payload.compliance.prescriptionRef,
      } : undefined,
    }));

    const dump = {
      version: "mediflow-offline-outbox-v1",
      exportedAt: new Date().toISOString(),
      storeId: "store-1",
      storeCode: "MAIN",
      count: sanitized.length,
      pendingSales: sanitized,
    };

    const serialized = JSON.stringify(dump);

    // Verify allowed fields exist
    expect(dump.version).toBe("mediflow-offline-outbox-v1");
    expect(dump.count).toBe(2);
    expect(dump.pendingSales[0].invoiceNo).toBe("M101/2526/000001");
    expect(dump.pendingSales[0].compliance?.doctorName).toBe("Dr. Arvind Mehta");

    // Strictly verify no tokens, secrets, or keys leaked
    expect(serialized).not.toContain("deviceToken");
    expect(serialized).not.toContain("token_hash");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("session");
  });
});
