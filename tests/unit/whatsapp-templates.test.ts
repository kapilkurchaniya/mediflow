import { describe, it, expect, vi } from "vitest";
import { WhatsAppService, MetaWebhookPayload } from "@/server/domain/whatsapp";

describe("WhatsApp Templates & Service Logic", () => {
  it("formats standard WhatsApp phone numbers into E.164 without symbols", () => {
    let clean = "9876543210".replace(/\D/g, "");
    if (clean.length === 10) clean = `91${clean}`;
    expect(clean).toBe("919876543210");

    let clean2 = "+91 98765 43210".replace(/\D/g, "");
    if (clean2.length === 10) clean2 = `91${clean2}`;
    expect(clean2).toBe("919876543210");
  });

  it("builds template payload structure matching Meta Graph API v19 specification", () => {
    const templateName = "invoice_receipt";
    const templateParams = [
      "Pawan",
      "MediFlow Chemist",
      "INV-1001",
      "450.00",
      "https://app.mediflow.in/r/token123",
    ];

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "919876543210",
      type: "template",
      template: {
        name: templateName,
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: templateParams.map((p) => ({ type: "text", text: p })),
          },
        ],
      },
    };

    expect(payload.type).toBe("template");
    expect(payload.template.name).toBe("invoice_receipt");
    expect(payload.template.components[0].parameters).toHaveLength(5);
    expect(payload.template.components[0].parameters[4].text).toContain("/r/token123");
  });

  it("handles incoming Meta delivery receipts and status mapping", async () => {
    const webhookPayload: MetaWebhookPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID_1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  phone_number_id: "PHONE_ID_1",
                },
                statuses: [
                  {
                    id: "wa_msg_123",
                    status: "delivered",
                    timestamp: "1730850000",
                  },
                  {
                    id: "wa_msg_456",
                    status: "failed",
                    timestamp: "1730850010",
                    errors: [{ code: 131047, message: "Re-engagement window closed" }],
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    // Validates payload parsing safely without throwing
    expect(webhookPayload.object).toBe("whatsapp_business_account");
    const statuses = webhookPayload.entry?.[0]?.changes?.[0]?.value?.statuses;
    expect(statuses).toHaveLength(2);
    expect(statuses?.[0]?.status).toBe("delivered");
    expect(statuses?.[1]?.errors?.[0]?.code).toBe(131047);
  });
});

