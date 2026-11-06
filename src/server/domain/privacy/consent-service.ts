import { db, schema } from "@/server/db";
import { eq, and, desc } from "drizzle-orm";
import type { ConsentPurpose, ConsentSource, CustomerConsentStatus } from "./types";
import type { CustomerConsent } from "@/server/db/schema/crm";

export class ConsentService {
  /**
   * Captures a consent action (grant or revocation) for a customer purpose.
   */
  static async captureConsent(opts: {
    tenantId: string;
    customerId: string;
    purpose: ConsentPurpose;
    granted: boolean;
    source?: ConsentSource;
    capturedBy?: string | null;
    notes?: string | null;
  }): Promise<CustomerConsent> {
    const { tenantId, customerId, purpose, granted, source = "pos", capturedBy, notes } = opts;

    const [record] = await db
      .insert(schema.customerConsents)
      .values({
        tenantId,
        customerId,
        purpose,
        granted,
        source,
        capturedBy: capturedBy || null,
        notes: notes || null,
      })
      .returning();

    return record;
  }

  /**
   * Checks whether active consent is granted for a specific purpose.
   * - 'transactional': Defaults to true (statutory legitimate use under Sec 7 DPDP Act for tax invoices)
   *   unless the patient has explicitly recorded a revocation.
   * - 'reminders' & 'marketing': Require explicit positive consent. If no record exists, defaults to false.
   */
  static async hasConsent(
    tenantId: string,
    customerId: string,
    purpose: ConsentPurpose
  ): Promise<boolean> {
    const [latest] = await db
      .select({ granted: schema.customerConsents.granted })
      .from(schema.customerConsents)
      .where(
        and(
          eq(schema.customerConsents.tenantId, tenantId),
          eq(schema.customerConsents.customerId, customerId),
          eq(schema.customerConsents.purpose, purpose)
        )
      )
      .orderBy(desc(schema.customerConsents.createdAt))
      .limit(1);

    if (purpose === "transactional") {
      return latest ? latest.granted : true;
    }

    return latest ? latest.granted : false;
  }

  /**
   * Returns current consent status matrix and chronological capture history.
   */
  static async getCustomerConsents(
    tenantId: string,
    customerId: string
  ): Promise<CustomerConsentStatus> {
    const history = await db
      .select({
        id: schema.customerConsents.id,
        purpose: schema.customerConsents.purpose,
        granted: schema.customerConsents.granted,
        source: schema.customerConsents.source,
        capturedBy: schema.customerConsents.capturedBy,
        notes: schema.customerConsents.notes,
        createdAt: schema.customerConsents.createdAt,
      })
      .from(schema.customerConsents)
      .where(
        and(
          eq(schema.customerConsents.tenantId, tenantId),
          eq(schema.customerConsents.customerId, customerId)
        )
      )
      .orderBy(desc(schema.customerConsents.createdAt));

    // Resolve latest status for each purpose
    let transactional = true;
    let reminders = false;
    let marketing = false;

    let foundTx = false;
    let foundReminders = false;
    let foundMarketing = false;

    for (const item of history) {
      if (item.purpose === "transactional" && !foundTx) {
        transactional = item.granted;
        foundTx = true;
      } else if (item.purpose === "reminders" && !foundReminders) {
        reminders = item.granted;
        foundReminders = true;
      } else if (item.purpose === "marketing" && !foundMarketing) {
        marketing = item.granted;
        foundMarketing = true;
      }
    }

    return {
      transactional,
      reminders,
      marketing,
      history,
    };
  }
}

