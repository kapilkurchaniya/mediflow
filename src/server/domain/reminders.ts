import { db, schema } from "@/server/db";
import { eq, and, lte, desc } from "drizzle-orm";
import { getSmsProvider } from "./sms";
import { WhatsAppService } from "./whatsapp";

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
   * Execute batch dispatch of due reminders via WhatsApp / SMS
   */
  static async processDueReminders(tenantId: string, storeId?: string | null) {
    const dueList = await this.getDueReminders(tenantId, storeId);
    const smsProvider = await getSmsProvider(tenantId);

    const results = {
      total: dueList.length,
      sent: 0,
      failed: 0,
    };

    for (const { reminder, medicineName } of dueList) {
      let waOk = false;
      let smsOk = false;

      // 1. Try WhatsApp if channel is 'whatsapp' or 'both'
      if (reminder.channel === "whatsapp" || reminder.channel === "both") {
        const waRes = await WhatsAppService.sendRefillReminder({
          tenantId,
          storeId: reminder.storeId,
          customerPhone: reminder.customerPhone,
          customerId: reminder.customerId,
          customerName: reminder.customerName,
          medicineName: medicineName || "Prescription Medicine",
        });
        waOk = waRes.success;
      }

      // 2. Try SMS if channel is 'sms' or (channel is 'both' and whatsapp wasn't delivered)
      if (reminder.channel === "sms" || (reminder.channel === "both" && !waOk)) {
        const smsRes = await smsProvider.sendSms(reminder.customerPhone, reminder.message);
        smsOk = smsRes.success;
      }

      const isSuccess = waOk || smsOk;

      await db
        .update(schema.reminders)
        .set({
          status: isSuccess ? "sent" : "failed",
          sentAt: isSuccess ? new Date() : null,
        })
        .where(eq(schema.reminders.id, reminder.id));

      if (isSuccess) results.sent++;
      else results.failed++;
    }

    return results;
  }
}
