import { db, schema } from "@/server/db";
import { eq, and } from "drizzle-orm";
import { DomainError } from "@/server/errors";
import { getSmsProvider, type SmsSendResult } from "@/server/domain/sms";
import { substituteDltVariables, validateSenderId } from "./dlt-validator";

export interface SendTemplateSmsParams {
  tenantId: string;
  to: string;
  templateName: string;
  variables: Record<string, string> | string[];
}

export class DltService {
  /**
   * Dispatches SMS only after verifying registered DLT compliance under TRAI TCCCPR 2018.
   * STRICTLY BLOCKS any send attempt if DLT template is missing or has no registered DLT ID.
   */
  static async sendTemplateSms(opts: SendTemplateSmsParams): Promise<SmsSendResult> {
    const { tenantId, to, templateName, variables } = opts;

    if (!to?.trim()) {
      return { success: false, provider: "dlt_gatekeeper", error: "Recipient phone number is required" };
    }

    // 1. Fetch template by name and tenantId
    const [template] = await db
      .select()
      .from(schema.smsTemplates)
      .where(
        and(
          eq(schema.smsTemplates.tenantId, tenantId),
          eq(schema.smsTemplates.name, templateName),
          eq(schema.smsTemplates.isActive, true)
        )
      )
      .limit(1);

    // 2. Pre-Send Gatekeeper: If template is missing or lacks DLT template ID, BLOCK!
    if (!template || !template.dltTemplateId?.trim()) {
      throw new DomainError(
        "DLT_TEMPLATE_REQUIRED",
        `SMS dispatch blocked: No approved DLT Content Template ID registered for '${templateName}'`
      );
    }

    // 3. Sender ID validation (TRAI 6-alphabetic characters)
    const senderCheck = validateSenderId(template.senderId);
    if (!senderCheck.valid) {
      throw new DomainError(
        "INVALID_SENDER_ID",
        `Invalid Sender ID for template '${templateName}': ${senderCheck.error}`
      );
    }

    // 4. Substitute variables into body
    const compiledMessage = substituteDltVariables(template.body, variables);

    // 5. Resolve provider and dispatch with DLT metadata
    const provider = await getSmsProvider(tenantId);
    return await provider.sendSms({
      to,
      message: compiledMessage,
      dltTemplateId: template.dltTemplateId,
      senderId: template.senderId,
      entityId: template.entityId || undefined,
    });
  }
}
