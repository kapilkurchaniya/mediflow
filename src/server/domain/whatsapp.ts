import { db, schema } from "@/server/db";
import { eq, and, sql } from "drizzle-orm";
import { decryptSecret } from "@/server/crypto";

export interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        statuses?: Array<{
          id?: string;
          status?: string;
          timestamp?: string;
          recipient_id?: string;
          errors?: Array<{ code?: number; title?: string; message?: string }>;
        }>;
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          interactive?: {
            button_reply?: {
              title?: string;
            };
          };
        }>;
      };
    }>;
  }>;
}

export interface WhatsAppSendParams {
  tenantId: string;
  storeId?: string | null;
  customerPhone: string;
  customerId?: string | null;
  templateName?: string;
  templateId?: string | null;
  templateParameters?: string[];
  templateLanguage?: string;
  messageType?: "text" | "template" | "document" | "image";
  messageBody: string;
  mediaUrl?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  status: "sent" | "delivered" | "failed";
  error?: string;
}

/**
 * WhatsApp Business API Domain Service
 */
export class WhatsAppService {
  /**
   * Retrieves active config for a tenant
   */
  static async getConfig(tenantId: string) {
    const [config] = await db
      .select()
      .from(schema.whatsappConfigs)
      .where(and(eq(schema.whatsappConfigs.tenantId, tenantId), eq(schema.whatsappConfigs.isActive, true)))
      .limit(1);

    return config || null;
  }

  /**
   * Checks whether an inbound customer message was received within the 24-hour service window
   */
  static async isWithin24HourWindow(tenantId: string, customerPhone: string): Promise<boolean> {
    const cleanPhone = customerPhone.replace(/\D/g, "").slice(-10);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [inbound] = await db
      .select({ id: schema.whatsappMessages.id })
      .from(schema.whatsappMessages)
      .where(
        and(
          eq(schema.whatsappMessages.tenantId, tenantId),
          eq(schema.whatsappMessages.direction, "inbound"),
          sql`${schema.whatsappMessages.customerPhone} LIKE ${`%${cleanPhone}`}`,
          sql`${schema.whatsappMessages.createdAt} >= ${twentyFourHoursAgo}`
        )
      )
      .limit(1);

    return !!inbound;
  }

  /**
   * Send WhatsApp text or template message via Meta Graph API (or simulator if unconfigured)
   */
  static async sendMessage(params: WhatsAppSendParams): Promise<SendResult> {
    const config = await this.getConfig(params.tenantId);

    // Format phone: ensure numeric without + or spaces, prefix with 91 for India if 10 digits
    let cleanPhone = params.customerPhone.replace(/\D/g, "");
    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }

    let metaMessageId = `wa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let status: "sent" | "failed" = "sent";
    let errorMessage: string | undefined = undefined;

    if (config?.accessToken && config?.phoneNumberId) {
      try {
        const payload: Record<string, unknown> = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanPhone,
        };

        if (params.messageType === "template" && params.templateName) {
          payload.type = "template";
          payload.template = {
            name: params.templateName,
            language: { code: params.templateLanguage || "en" },
            ...(params.templateParameters && params.templateParameters.length > 0
              ? {
                  components: [
                    {
                      type: "body",
                      parameters: params.templateParameters.map((p) => ({
                        type: "text",
                        text: p,
                      })),
                    },
                  ],
                }
              : {}),
          };
        } else if (params.messageType === "document" && params.mediaUrl) {
          payload.type = "document";
          payload.document = {
            link: params.mediaUrl,
            caption: params.messageBody,
          };
        } else {
          // If outside 24h window and template is supplied, prefer template
          payload.type = "text";
          payload.text = { body: params.messageBody };
        }

        const res = await fetch(`https://graph.facebook.com/v19.0/${config.phoneNumberId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${decryptSecret(config.accessToken)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const resData = await res.json();
        if (res.ok && resData.messages?.[0]?.id) {
          metaMessageId = resData.messages[0].id;
          status = "sent";
        } else {
          status = "failed";
          errorMessage = resData.error?.message || "Meta API error";
        }
      } catch (err: unknown) {
        status = "failed";
        errorMessage = err instanceof Error ? err.message : String(err);
      }
    } else {
      // Simulator mode for development / demo
      console.log(`[WhatsApp Simulator] Sent to ${cleanPhone}: "${params.messageBody}"`);
    }

    // Record message in db
    try {
      await db.insert(schema.whatsappMessages).values({
        tenantId: params.tenantId,
        storeId: params.storeId || null,
        direction: "outbound",
        customerId: params.customerId || null,
        customerPhone: cleanPhone,
        templateId: params.templateId || null,
        messageBody: params.messageBody,
        messageType: params.messageType || "text",
        status: status,
        metaMessageId: metaMessageId,
        errorCode: errorMessage || null,
      });
    } catch (dbErr) {
      console.error("[WhatsApp] Failed to save outbound log:", dbErr);
    }

    return {
      success: status === "sent",
      messageId: metaMessageId,
      status,
      error: errorMessage,
    };
  }

  /**
   * Send Invoice Receipt on WhatsApp (with public receipt link and template parameters)
   */
  static async sendInvoiceReceipt(opts: {
    tenantId: string;
    storeId?: string | null;
    customerPhone: string;
    customerId?: string | null;
    invoiceNo: string;
    patientName?: string | null;
    totalAmountPaise: number;
    pdfUrl?: string;
    publicReceiptUrl?: string;
  }): Promise<SendResult> {
    const formattedAmount = (opts.totalAmountPaise / 100).toFixed(2);
    const greeting = opts.patientName ? `Dear ${opts.patientName},` : `Dear Valued Customer,`;

    const receiptUrlPart = opts.publicReceiptUrl
      ? `\n\nView & Download Official Digital Invoice:\n${opts.publicReceiptUrl}\n\n`
      : opts.pdfUrl
      ? `\n\nView & Download Invoice: ${opts.pdfUrl}\n\n`
      : "\n\n";

    const message = `${greeting}\n\nThank you for shopping with us! Your tax invoice *#${opts.invoiceNo}* for *₹${formattedAmount}* is ready.${receiptUrlPart}Wishing you good health!`;

    // Check if within 24-hr session window
    const inWindow = await this.isWithin24HourWindow(opts.tenantId, opts.customerPhone);
    const config = await this.getConfig(opts.tenantId);

    // If configured with Meta API and outside 24h window, dispatch using registered template
    const useTemplate = !!config?.accessToken && !inWindow;

    return this.sendMessage({
      tenantId: opts.tenantId,
      storeId: opts.storeId,
      customerPhone: opts.customerPhone,
      customerId: opts.customerId,
      messageType: useTemplate ? "template" : opts.pdfUrl ? "document" : "text",
      templateName: useTemplate ? "invoice_receipt" : undefined,
      templateParameters: useTemplate
        ? [
            opts.patientName || "Valued Customer",
            "MediFlow Pharmacy",
            opts.invoiceNo,
            formattedAmount,
            opts.publicReceiptUrl || "",
          ]
        : undefined,
      messageBody: message,
      mediaUrl: opts.pdfUrl,
    });
  }

  /**
   * Send Refill Reminder
   */
  static async sendRefillReminder(opts: {
    tenantId: string;
    storeId?: string | null;
    customerPhone: string;
    customerId?: string | null;
    customerName?: string | null;
    medicineName: string;
    expiryDaysRemaining?: number;
  }): Promise<SendResult> {
    const greeting = opts.customerName ? `Dear ${opts.customerName},` : `Hello,`;
    const message = `${greeting}\n\nThis is a friendly health reminder from MediFlow Pharmacy. Your prescription for *${opts.medicineName}* is due for refill soon.\n\nTo reserve your medicine for pickup or doorstep delivery, reply *YES* or call us.`;

    const inWindow = await this.isWithin24HourWindow(opts.tenantId, opts.customerPhone);
    const config = await this.getConfig(opts.tenantId);
    const useTemplate = !!config?.accessToken && !inWindow;

    return this.sendMessage({
      tenantId: opts.tenantId,
      storeId: opts.storeId,
      customerPhone: opts.customerPhone,
      customerId: opts.customerId,
      messageType: useTemplate ? "template" : "text",
      templateName: useTemplate ? "refill_reminder" : undefined,
      templateParameters: useTemplate
        ? [
            opts.customerName || "Customer",
            "MediFlow Pharmacy",
            opts.medicineName,
            opts.expiryDaysRemaining ? `${opts.expiryDaysRemaining} days` : "soon",
          ]
        : undefined,
      messageBody: message,
    });
  }

  /**
   * Send Payment Reminder
   */
  static async sendPaymentReminder(opts: {
    tenantId: string;
    storeId?: string | null;
    customerPhone: string;
    customerId?: string | null;
    customerName: string;
    outstandingPaise: number;
  }): Promise<SendResult> {
    const formattedAmount = (opts.outstandingPaise / 100).toFixed(2);
    const message = `Dear ${opts.customerName},\n\nThis is a gentle payment reminder from MediFlow Pharmacy. Your current outstanding ledger balance is *₹${formattedAmount}*.\n\nPlease clear the dues via UPI or at the pharmacy counter at your earliest convenience. Thank you!`;

    const inWindow = await this.isWithin24HourWindow(opts.tenantId, opts.customerPhone);
    const config = await this.getConfig(opts.tenantId);
    const useTemplate = !!config?.accessToken && !inWindow;

    return this.sendMessage({
      tenantId: opts.tenantId,
      storeId: opts.storeId,
      customerPhone: opts.customerPhone,
      customerId: opts.customerId,
      messageType: useTemplate ? "template" : "text",
      templateName: useTemplate ? "payment_reminder" : undefined,
      templateParameters: useTemplate
        ? [
            opts.customerName,
            "MediFlow Pharmacy",
            formattedAmount,
          ]
        : undefined,
      messageBody: message,
    });
  }

  /**
   * Process incoming webhook payload from Meta
   */
  static async handleIncomingWebhook(payload: MetaWebhookPayload) {
    if (payload.object !== "whatsapp_business_account") return;

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;
        const val = change.value;
        if (!val) continue;
        const metadata = val.metadata;
        const phoneNumberId = metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // Find tenant by phoneNumberId
        const [config] = await db
          .select()
          .from(schema.whatsappConfigs)
          .where(eq(schema.whatsappConfigs.phoneNumberId, phoneNumberId))
          .limit(1);

        if (!config) continue;

        // Process message statuses (delivery receipts)
        for (const st of val.statuses || []) {
          if (!st.status || !st.id) continue;
          const statusMap: Record<string, "sent" | "delivered" | "read" | "failed"> = {
            sent: "sent",
            delivered: "delivered",
            read: "read",
            failed: "failed",
          };
          const mappedStatus = statusMap[st.status];
          if (mappedStatus) {
            const errorMsg = st.errors?.[0]?.message || (mappedStatus === "failed" ? "Meta delivery failed" : null);

            await db
              .update(schema.whatsappMessages)
              .set({
                status: mappedStatus,
                ...(errorMsg ? { errorCode: errorMsg } : {}),
              })
              .where(eq(schema.whatsappMessages.metaMessageId, st.id));
          }
        }

        // Process incoming user messages
        for (const msg of val.messages || []) {
          if (!msg.from) continue;
          const fromPhone = msg.from;
          const body = msg.text?.body || (msg.type === "interactive" ? msg.interactive?.button_reply?.title : "") || `[${msg.type} message]`;

          // Find customer by phone
          const [customer] = await db
            .select()
            .from(schema.customers)
            .where(and(eq(schema.customers.tenantId, config.tenantId), eq(schema.customers.phone, fromPhone.slice(-10))))
            .limit(1);

          await db.insert(schema.whatsappMessages).values({
            tenantId: config.tenantId,
            direction: "inbound",
            customerId: customer?.id || null,
            customerPhone: fromPhone,
            messageBody: body,
            messageType: msg.type || "text",
            status: "delivered",
            metaMessageId: msg.id,
          });
        }
      }
    }
  }
}
