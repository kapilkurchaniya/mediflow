import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();

class MockQueryBuilder {
  constructor(private resultFn: () => unknown) {}
  from() { return this; }
  where() { return this; }
  orderBy() { return this; }
  limit() { return this; }
  then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
    return Promise.resolve(this.resultFn()).then(onFulfilled, onRejected);
  }
}

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(() => new MockQueryBuilder(mockSelect)),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: mockInsert,
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: mockUpdate,
        })),
      })),
    })),
    transaction: vi.fn((callback) => mockTransaction(callback)),
  },
  schema: {
    customers: {
      id: "id",
      tenantId: "tenant_id",
      name: "name",
      phone: "phone",
      email: "email",
      address: "address",
      gstin: "gstin",
      stateCode: "state_code",
      isActive: "is_active",
      notes: "notes",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    customerConsents: {
      id: "id",
      tenantId: "tenant_id",
      customerId: "customer_id",
      purpose: "purpose",
      granted: "granted",
      source: "source",
      capturedBy: "captured_by",
      notes: "notes",
      createdAt: "created_at",
    },
    loyaltyTransactions: {
      id: "id",
      tenantId: "tenant_id",
      customerId: "customer_id",
      type: "type",
      points: "points",
      balanceAfter: "balance_after",
      createdAt: "created_at",
      note: "note",
    },
    sales: {
      id: "id",
      tenantId: "tenant_id",
      customerId: "customer_id",
      invoiceNo: "invoice_no",
      totalAmount: "total_amount",
      status: "status",
      createdAt: "created_at",
    },
    prescriptions: {
      id: "id",
      tenantId: "tenant_id",
      customerId: "customer_id",
      doctorName: "doctor_name",
      createdAt: "created_at",
    },
    auditLogs: {
      id: "id",
      tenantId: "tenant_id",
      userId: "user_id",
      action: "action",
      entityType: "entity_type",
      entityId: "entity_id",
      oldValue: "old_value",
      newValue: "new_value",
      reason: "reason",
      createdAt: "created_at",
    },
  },
}));

import { ConsentService } from "@/server/domain/privacy/consent-service";
import { ErasureService } from "@/server/domain/privacy/erasure-service";

describe("DPDP Act 2023 Consent & Statutory Erasure Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. ConsentService Granular Purpose Verification", () => {
    it("transactional consent defaults to true when no record exists (legitimate statutory use)", async () => {
      mockSelect.mockReturnValueOnce([]); // No record in DB

      const hasTx = await ConsentService.hasConsent("tenant_1", "cust_1", "transactional");
      expect(hasTx).toBe(true);
    });

    it("transactional consent returns false when patient has explicitly revoked it", async () => {
      mockSelect.mockReturnValueOnce([{ granted: false }]);

      const hasTx = await ConsentService.hasConsent("tenant_1", "cust_1", "transactional");
      expect(hasTx).toBe(false);
    });

    it("reminders consent requires explicit opt-in (defaults to false when no record exists)", async () => {
      mockSelect.mockReturnValueOnce([]); // No record

      const hasReminders = await ConsentService.hasConsent("tenant_1", "cust_1", "reminders");
      expect(hasReminders).toBe(false);
    });

    it("reminders consent returns true when actively granted", async () => {
      mockSelect.mockReturnValueOnce([{ granted: true }]);

      const hasReminders = await ConsentService.hasConsent("tenant_1", "cust_1", "reminders");
      expect(hasReminders).toBe(true);
    });

    it("resolves consent matrix and chronological history correctly", async () => {
      const sampleHistory = [
        {
          id: "c_3",
          purpose: "reminders",
          granted: true,
          source: "pos",
          capturedBy: "user_1",
          notes: "POS Opt-in",
          createdAt: new Date("2026-11-06T10:00:00Z"),
        },
        {
          id: "c_2",
          purpose: "transactional",
          granted: true,
          source: "pos",
          capturedBy: "user_1",
          notes: "POS Auto",
          createdAt: new Date("2026-11-06T09:00:00Z"),
        },
        {
          id: "c_1",
          purpose: "reminders",
          granted: false,
          source: "privacy_portal",
          capturedBy: "user_1",
          notes: "Earlier opt-out",
          createdAt: new Date("2026-11-01T09:00:00Z"),
        },
      ];

      mockSelect.mockReturnValueOnce(sampleHistory);

      const status = await ConsentService.getCustomerConsents("tenant_1", "cust_1");
      expect(status.transactional).toBe(true);
      expect(status.reminders).toBe(true); // Latest record c_3 is true
      expect(status.marketing).toBe(false); // No marketing record -> false
      expect(status.history).toHaveLength(3);
    });
  });

  describe("2. ErasureService Data Export & Statutory Erasure", () => {
    it("exports complete machine-readable JSON archive under Section 11 DPDP", async () => {
      // 1. customer query
      mockSelect.mockReturnValueOnce([
        {
          id: "cust_101",
          tenantId: "tenant_1",
          name: "Ramesh Kumar",
          phone: "9876543210",
          email: "ramesh@example.com",
          address: "123 MG Road, Bengaluru",
          gstin: null,
          stateCode: "29",
          loyaltyPoints: 120,
          creditLimit: 500000,
          createdAt: new Date("2026-01-15"),
        },
      ]);

      // 2. consents history query
      mockSelect.mockReturnValueOnce([
        {
          id: "c_1",
          purpose: "reminders",
          granted: true,
          source: "pos",
          capturedBy: null,
          notes: null,
          createdAt: new Date(),
        },
      ]);

      // 3. loyalty transactions
      mockSelect.mockReturnValueOnce([
        {
          id: "ltx_1",
          type: "earn",
          points: 50,
          balanceAfter: 120,
          createdAt: new Date(),
          note: "Bill #INV-101",
        },
      ]);

      // 4. sales rows
      mockSelect.mockReturnValueOnce([
        {
          id: "sale_1",
          invoiceNo: "INV-101",
          createdAt: new Date(),
          totalAmountPaise: 45000,
          status: "completed",
        },
      ]);

      // 5. prescriptions
      mockSelect.mockReturnValueOnce([
        {
          id: "rx_1",
          doctorName: "Dr. K. Sharma",
          createdAt: new Date(),
        },
      ]);

      const exported = await ErasureService.exportCustomerData("tenant_1", "cust_101");

      expect(exported.exportMetadata.statutoryNotice).toContain("Digital Personal Data Protection Act, 2023");
      expect(exported.exportMetadata.statutoryNotice).toContain("CGST Act Sec 36");
      expect(exported.profile.name).toBe("Ramesh Kumar");
      expect(exported.profile.phone).toBe("9876543210");
      expect(exported.salesSummary[0].invoiceNo).toBe("INV-101");
      expect(exported.salesSummary[0].statutoryNotice).toContain("72 months per CGST Act");
      expect(exported.prescriptionsSummary[0].doctorName).toBe("Dr. K. Sharma");
    });

    it("anonymises personal data while safeguarding statutory retention", async () => {
      const existingCustomer = {
        id: "cust_202",
        tenantId: "tenant_1",
        name: "Sita Sharma",
        phone: "9123456780",
        email: "sita@example.com",
        address: "Flat 4B, Green Apts",
        isActive: true,
      };

      mockSelect.mockReturnValueOnce([existingCustomer]);

      const mockTxUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                ...existingCustomer,
                name: "Anonymous (DPDP Erased)",
                phone: null,
                email: null,
                isActive: false,
              },
            ]),
          }),
        }),
      });

      const mockTxInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      });

      mockTransaction.mockImplementationOnce(async (callback) => {
        const tx = {
          update: mockTxUpdate,
          insert: mockTxInsert,
        };
        return await callback(tx);
      });

      const result = await ErasureService.anonymiseCustomer({
        tenantId: "tenant_1",
        customerId: "cust_202",
        actorUserId: "user_admin",
        reason: "Patient requested erasure",
      });

      expect(result.success).toBe(true);
      expect(result.anonymisedCustomer.name).toBe("Anonymous (DPDP Erased)");
      expect(result.anonymisedCustomer.phone).toBeNull();
      expect(result.anonymisedCustomer.isActive).toBe(false);

      // Verify consent revocations and audit log were inserted in transaction
      expect(mockTxInsert).toHaveBeenCalledTimes(2);
    });

    it("blocks redundant anonymisation if customer was already erased", async () => {
      mockSelect.mockReturnValueOnce([
        {
          id: "cust_already_erased",
          tenantId: "tenant_1",
          name: "Anonymous (DPDP Erased)",
          isActive: false,
        },
      ]);

      await expect(
        ErasureService.anonymiseCustomer({
          tenantId: "tenant_1",
          customerId: "cust_already_erased",
          actorUserId: "user_admin",
        })
      ).rejects.toThrow("This customer has already been anonymised per DPDP.");
    });
  });
});
