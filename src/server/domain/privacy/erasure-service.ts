import { db, schema } from "@/server/db";
import { eq, and, desc } from "drizzle-orm";
import { DomainError, NotFoundError } from "@/server/errors";
import { ConsentService } from "./consent-service";
import type { ExportedCustomerData } from "./types";

export class ErasureService {
  /**
   * Compiles and exports complete customer data package under Section 11 of DPDP Act 2023.
   */
  static async exportCustomerData(
    tenantId: string,
    customerId: string
  ): Promise<ExportedCustomerData> {
    const [customer] = await db
      .select()
      .from(schema.customers)
      .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, tenantId)))
      .limit(1);

    if (!customer) {
      throw new NotFoundError("Customer not found or does not belong to this tenant");
    }

    // 1. Consents
    const consents = await ConsentService.getCustomerConsents(tenantId, customerId);

    // 2. Loyalty transactions
    const loyaltyTxs = await db
      .select({
        id: schema.loyaltyTransactions.id,
        type: schema.loyaltyTransactions.type,
        points: schema.loyaltyTransactions.points,
        balanceAfter: schema.loyaltyTransactions.balanceAfter,
        createdAt: schema.loyaltyTransactions.createdAt,
        note: schema.loyaltyTransactions.note,
      })
      .from(schema.loyaltyTransactions)
      .where(
        and(
          eq(schema.loyaltyTransactions.tenantId, tenantId),
          eq(schema.loyaltyTransactions.customerId, customerId)
        )
      )
      .orderBy(desc(schema.loyaltyTransactions.createdAt))
      .limit(100);

    // 3. Sales summary (preserving financial integrity)
    const salesRows = await db
      .select({
        id: schema.sales.id,
        invoiceNo: schema.sales.invoiceNo,
        createdAt: schema.sales.createdAt,
        totalAmountPaise: schema.sales.totalAmount,
        status: schema.sales.status,
      })
      .from(schema.sales)
      .where(and(eq(schema.sales.tenantId, tenantId), eq(schema.sales.customerId, customerId)))
      .orderBy(desc(schema.sales.createdAt))
      .limit(200);

    // 4. Prescriptions summary
    const rxRows = await db
      .select({
        id: schema.prescriptions.id,
        doctorName: schema.prescriptions.doctorName,
        createdAt: schema.prescriptions.createdAt,
      })
      .from(schema.prescriptions)
      .where(
        and(
          eq(schema.prescriptions.tenantId, tenantId),
          eq(schema.prescriptions.customerId, customerId)
        )
      )
      .orderBy(desc(schema.prescriptions.createdAt))
      .limit(100);

    return {
      exportMetadata: {
        exportDate: new Date().toISOString(),
        statutoryNotice:
          "Digital Personal Data Protection Act, 2023 (Section 11 Data Portability). Financial & drug records retained per CGST Act Sec 36 and Drugs & Cosmetics Rules 1945 Rule 65.",
        tenantId,
        customerId,
        dpdpComplianceVersion: "1.0",
      },
      profile: {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        gstin: customer.gstin,
        stateCode: customer.stateCode,
        loyaltyPoints: customer.loyaltyPoints ?? 0,
        creditLimitPaise: customer.creditLimit ?? 0,
        createdAt: customer.createdAt,
      },
      consents: {
        current: {
          transactional: consents.transactional,
          reminders: consents.reminders,
          marketing: consents.marketing,
        },
        history: consents.history,
      },
      loyalty: {
        balance: customer.loyaltyPoints ?? 0,
        transactions: loyaltyTxs,
      },
      salesSummary: salesRows.map((s) => ({
        ...s,
        statutoryNotice: "Statutory tax invoice retained for 72 months per CGST Act Section 36",
      })),
      prescriptionsSummary: rxRows.map((rx) => ({
        ...rx,
        statutoryNotice: "Statutory prescription record retained per Drugs and Cosmetics Rule 65",
      })),
    };
  }

  /**
   * Executes statutory anonymisation under DPDP Act Section 12(3).
   * Redacts personal data in customers table while preserving mandatory statutory tax & drug records.
   */
  static async anonymiseCustomer(opts: {
    tenantId: string;
    customerId: string;
    actorUserId: string;
    reason?: string;
  }) {
    const { tenantId, customerId, actorUserId, reason } = opts;

    const [existing] = await db
      .select()
      .from(schema.customers)
      .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, tenantId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Customer not found or does not belong to this tenant");
    }

    if (!existing.isActive && existing.name?.includes("DPDP Erased")) {
      throw new DomainError("ALREADY_ANONYMISED", "This customer has already been anonymised per DPDP.");
    }

    const isoDate = new Date().toISOString();

    return await db.transaction(async (tx) => {
      // 1. Redact Customer PII
      const [updated] = await tx
        .update(schema.customers)
        .set({
          name: "Anonymous (DPDP Erased)",
          phone: null,
          email: null,
          address: `[Redacted per DPDP Section 12 on ${isoDate}]`,
          gstin: null,
          stateCode: null,
          doctorName: null,
          doctorRegNo: null,
          notes:
            "Statutory financial and prescription records retained per Section 36 CGST Act & Rule 65 Drugs and Cosmetics Rules. Personal data erased.",
          isActive: false,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, tenantId)))
        .returning();

      // 2. Revoke all consents in customerConsents
      await tx.insert(schema.customerConsents).values([
        {
          tenantId,
          customerId,
          purpose: "reminders",
          granted: false,
          source: "erasure_request",
          capturedBy: actorUserId,
          notes: reason || "Revoked upon statutory DPDP erasure request",
        },
        {
          tenantId,
          customerId,
          purpose: "marketing",
          granted: false,
          source: "erasure_request",
          capturedBy: actorUserId,
          notes: reason || "Revoked upon statutory DPDP erasure request",
        },
        {
          tenantId,
          customerId,
          purpose: "transactional",
          granted: false,
          source: "erasure_request",
          capturedBy: actorUserId,
          notes: reason || "Revoked upon statutory DPDP erasure request",
        },
      ]);

      // 3. Write Audit Log
      await tx.insert(schema.auditLogs).values({
        tenantId,
        userId: actorUserId,
        action: "customer.anonymise_dpdp",
        entityType: "customers",
        entityId: customerId,
        oldValue: {
          name: existing.name,
          phone: existing.phone ? "REDACTED_PHONE" : null,
          email: existing.email ? "REDACTED_EMAIL" : null,
        },
        newValue: {
          name: "Anonymous (DPDP Erased)",
          phone: null,
          email: null,
          statutoryRetentionShield: "CGST_SEC_36_DCR_RULE_65",
        },
        reason: reason || "Right to erasure exercised under Section 12 DPDP Act 2023",
      });

      return { success: true, anonymisedCustomer: updated };
    });
  }
}
