import { NextResponse } from "next/server";
import { getAuthCtx, can } from "@/server/rbac";
import { checkAiRateLimit } from "@/server/ai/rate-limiter";
import { readAndValidateOcrFile, runTextOcr } from "@/server/ai/ocr";
import {
  BILLING_TEMPLATE_PLACEHOLDERS,
  sanitizeBillingTemplateHtml,
} from "@/server/domain/sales/template-engine";

export const maxDuration = 60;

export async function POST(req: Request) {
  const ctx = await getAuthCtx().catch(() => null);
  if (!ctx || !ctx.tenantId || !ctx.storeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(ctx, "settings.manage")) {
    return NextResponse.json({ error: "Forbidden: settings.manage permission required." }, { status: 403 });
  }

  const rl = checkAiRateLimit(ctx.tenantId, ctx.userId);
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.reason || "Rate limit exceeded." }, { status: 429 });
  }

  try {
    const formData = await req.formData();
    const format = formData.get("format") === "thermal_80mm" ? "thermal_80mm" : "a4";
    const { bytes, mimeType } = await readAndValidateOcrFile(formData);

    const widthGuide =
      format === "thermal_80mm"
        ? "Target width is 80mm continuous thermal receipt paper (max-width: 76mm; monospace/compact sans-serif; crisp dashed/solid borders; black & white print-safe)."
        : "Target format is A4 portrait GST Tax Invoice (width: 100%; max-width: 210mm; clean bordered tables; crisp black & white / subtle gray headers).";

    const prompt = `You are a print-layout engineer. Convert the uploaded physical pharmacy bill image/PDF into a clean, print-ready HTML + scoped <style> billing template for MediFlow.
${widthGuide}

CRITICAL RULES:
1. Return ONLY raw HTML (starting with <style> or <div id="custom-bill-root">). Do NOT wrap in markdown code fences.
2. Wrap all markup inside <div id="custom-bill-root">...</div> and scope all CSS selectors under #custom-bill-root.
3. NEVER use <script>, <iframe>, external fonts/CDNs, or inline event handlers.
4. Replicate the visual layout, column order, header/footer blocks, and typography of the uploaded physical bill, replacing all hardcoded business/invoice/item values with MediFlow's exact placeholders:
${BILLING_TEMPLATE_PLACEHOLDERS.join("\n")}
5. For the line items table body, wrap the repeating <tr> inside {{#each items}} ... {{/each}} using {{this.sno}}, {{this.name}}, {{this.hsn}}, {{this.batchNo}}, {{this.expiry}}, {{this.qtyFormatted}}, {{this.mrp}}, {{this.rate}}, {{this.discount}}, {{this.gstPct}}, {{this.amount}}.`;

    const raw = await runTextOcr({ bytes, mimeType, prompt });
    const strippedFences = raw
      .replace(/^```(?:html)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const sanitized = sanitizeBillingTemplateHtml(strippedFences);
    if (!sanitized) {
      return NextResponse.json({ error: "Could not generate valid HTML from the uploaded bill." }, { status: 422 });
    }

    return NextResponse.json({ html: sanitized, format });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to process bill template OCR.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

