import { db, schema } from "@/server/db";
import { eq, and, lte, desc } from "drizzle-orm";
import { enqueue } from "@/server/jobs/outbox";

export class RemindersService {
  /**
   * Schedule automatic refill reminder after medicine purchase
   */
  static async createRefillReminder(opts: {
    tenantId: string;
    storeId?: string | null;
    customerId?: string | null;
    customerName: string;
    customerPhone: string;
    medicineId: string;
    medicineName: string;
    daysAfterPurchase?: number; // e.g. 26 days for a 30-day course
  }) {
    const days = opts.daysAfterPurchase || 26;
    const scheduled = new Date();
    scheduled.setDate(scheduled.getDate() + days);
    const scheduledDateStr = scheduled.toISOString().split("T")[0];

    const message = `Hello ${opts.customerName}, your course of ${opts.medicineName} is due for refill on ${scheduledDateStr}. Reply YES to reserve your medicine with MediFlow.`;

    const [reminder] = await db
      .insert(schema.reminders)
      .values({
        tenantId: opts.tenantId,
        storeId: opts.storeId || null,
        customerId: opts.customerId || null,
        customerName: opts.customerName,
        customerPhone: opts.customerPhone,
        type: "refill",
        medicineId: opts.medicineId,
        scheduledDate: scheduledDateStr,
        message,
        channel: "both",
        status: "pending",
      })
      .returning();

    return reminder;
  }

  /**
   * Get all pending due reminders for a tenant up to today
   */
  static async getDueReminders(tenantId: string, storeId?: string | null) {
    const today = new Date().toISOString().split("T")[0];

    const conditions = [
      eq(schema.reminders.tenantId, tenantId),
      eq(schema.reminders.status, "pending"),
      lte(schema.reminders.scheduledDate, today),
    ];

    if (storeId) {
      conditions.push(eq(schema.reminders.storeId, storeId));
    }

    return db
      .select({
        reminder: schema.reminders,
        medicineName: schema.medicines.name,
      })
      .from(schema.reminders)
      .leftJoin(schema.medicines, eq(schema.reminders.medicineId, schema.medicines.id))
      .where(and(...conditions))
      .orderBy(desc(schema.reminders.scheduledDate));
  }

  /**
   * Batch dispatch due reminders through Outbox worker (B2.7)
   */
  static async processDueReminders(tenantId: string, storeId?: string | null) {
    const dueList = await this.getDueReminders(tenantId, storeId);
    let enqueued = 0;

    await db.transaction(async (tx) => {
      for (const { reminder } of dueList) {
        await enqueue(tx, tenantId, "reminder.send", { reminderId: reminder.id });
        enqueued++;
      }
    });

    return { total: dueList.length, sent: enqueued, failed: 0 };
  }
}
