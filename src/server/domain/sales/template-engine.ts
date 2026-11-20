export interface BillingTemplateItemContext {
  sno: number;
  name: string;
  hsn: string;
  batchNo: string;
  expiry: string;
  qtyFormatted: string;
  mrp: string;
  rate: string;
  discount: string;
  gstPct: string;
  amount: string;
}

export interface BillingTemplateContext {
  store: {
    name: string;
    legalName: string;
    address: string;
    city: string;
    pincode: string;
    phone: string;
    gstin: string;
    drugLicenseNo: string;
    fssaiNo: string;
  };
  sale: {
    invoiceNo: string;
    invoiceDate: string;
    customerName: string;
    customerPhone: string;
    doctorName: string;
    paymentSummary: string;
    isCancelled: boolean;
  };
  totals: {
    subtotal: string;
    discount: string;
    cgst: string;
    sgst: string;
    igst: string;
    roundOff: string;
    grandTotal: string;
    amountInWords: string;
  };
  gst: {
    irn: string;
    ackNo: string;
    qrDataUrl: string;
  };
  items: BillingTemplateItemContext[];
}

export const BILLING_TEMPLATE_PLACEHOLDERS = [
  "{{store.name}}",
  "{{store.legalName}}",
  "{{store.address}}",
  "{{store.city}}",
  "{{store.pincode}}",
  "{{store.phone}}",
  "{{store.gstin}}",
  "{{store.drugLicenseNo}}",
  "{{store.fssaiNo}}",
  "{{sale.invoiceNo}}",
  "{{sale.invoiceDate}}",
  "{{sale.customerName}}",
  "{{sale.customerPhone}}",
  "{{sale.doctorName}}",
  "{{sale.paymentSummary}}",
  "{{totals.subtotal}}",
  "{{totals.discount}}",
  "{{totals.cgst}}",
  "{{totals.sgst}}",
  "{{totals.igst}}",
  "{{totals.roundOff}}",
  "{{totals.grandTotal}}",
  "{{totals.amountInWords}}",
  "{{gst.irn}}",
  "{{gst.ackNo}}",
  "{{#each items}} ... {{this.sno}} {{this.name}} {{this.hsn}} {{this.batchNo}} {{this.expiry}} {{this.qtyFormatted}} {{this.mrp}} {{this.rate}} {{this.discount}} {{this.gstPct}} {{this.amount}} {{/each}}",
] as const;

export function escapeHtml(raw: unknown): string {
  const s = raw === null || raw === undefined ? "" : String(raw);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Strips executable/dangerous HTML constructs while preserving layout markup and scoped <style>.
 */
export function sanitizeBillingTemplateHtml(html: string): string {
  let clean = html;
  // Remove dangerous tags and their contents
  clean = clean.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  clean = clean.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");
  clean = clean.replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "");
  clean = clean.replace(/<embed\b[^>]*>/gi, "");
  clean = clean.replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "");
  clean = clean.replace(/<meta\b[^>]*>/gi, "");
  clean = clean.replace(/<link\b[^>]*>/gi, "");
  clean = clean.replace(/<base\b[^>]*>/gi, "");

  // Strip inline event handlers (onclick=, onload=, onerror=, etc.)
  clean = clean.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Strip javascript: / vbscript: / data:text/html URIs
  clean = clean.replace(/(href|src|action|formaction)\s*=\s*(["'])\s*(?:javascript|vbscript|data:text\/html):[\s\S]*?\2/gi, '$1="#"');
  // Strip CSS expression() or @import
  clean = clean.replace(/expression\s*\([^)]*\)/gi, "");
  clean = clean.replace(/@import\s+[^;]+;/gi, "");

  return clean.trim();
}

function resolvePath(root: Record<string, unknown>, pathStr: string): unknown {
  const parts = pathStr.trim().split(".");
  let curr: unknown = root;
  for (const part of parts) {
    if (curr === null || curr === undefined || typeof curr !== "object") return "";
    curr = (curr as Record<string, unknown>)[part];
  }
  return curr;
}

/**
 * Zero-eval logic-safe template renderer supporting:
 * - {{#each items}} ... {{/each}}
 * - {{#if path}} ... {{/if}}
 * - {{path}} with automatic HTML escaping
 */
export function renderBillingTemplate(rawHtml: string, ctx: BillingTemplateContext): string {
  let output = sanitizeBillingTemplateHtml(rawHtml);

  // 1. Expand {{#each items}}...{{/each}}
  output = output.replace(
    /\{\{#each\s+items\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match, inner: string) => {
      return ctx.items
        .map((item) => {
          return inner.replace(/\{\{\s*(?:this\.)?([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key: string) => {
            const val = (item as unknown as Record<string, unknown>)[key];
            return escapeHtml(val);
          });
        })
        .join("\n");
    }
  );

  // 2. Expand {{#if path}}...{{/if}}
  const rootObj = ctx as unknown as Record<string, unknown>;
  output = output.replace(
    /\{\{#if\s+([a-zA-Z0-9_.]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, pathStr: string, inner: string) => {
      const val = resolvePath(rootObj, pathStr);
      const truthy = Array.isArray(val) ? val.length > 0 : Boolean(val);
      return truthy ? inner : "";
    }
  );

  // 3. Substitute scalar {{path}} placeholders
  output = output.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, pathStr: string) => {
    const val = resolvePath(rootObj, pathStr);
    return escapeHtml(val);
  });

  // Final sanitization pass after interpolation
  return sanitizeBillingTemplateHtml(output);
}

export function getSampleBillingContext(): BillingTemplateContext {
  return {
    store: {
      name: "MediFlow Pharmacy — Main Branch",
      legalName: "MediFlow Healthcare Pvt. Ltd.",
      address: "14, MG Road, Indiranagar",
      city: "Bengaluru",
      pincode: "560038",
      phone: "+91 98765 43210",
      gstin: "29AABCM1234F1Z5",
      drugLicenseNo: "KA-BLR-20B-112233 / 21B-445566",
      fssaiNo: "11223344556677",
    },
    sale: {
      invoiceNo: "INV-2627-00142",
      invoiceDate: "20 Nov 2026, 02:30 PM",
      customerName: "Ramesh Kumar",
      customerPhone: "98765 00112",
      doctorName: "Dr. Ananya Rao",
      paymentSummary: "UPI: ₹280.00",
      isCancelled: false,
    },
    totals: {
      subtotal: "₹265.00",
      discount: "₹15.00",
      cgst: "₹15.00",
      sgst: "₹15.00",
      igst: "₹0.00",
      roundOff: "₹0.00",
      grandTotal: "₹280.00",
      amountInWords: "Two Hundred Eighty Rupees Only",
    },
    gst: {
      irn: "",
      ackNo: "",
      qrDataUrl: "",
    },
    items: [
      {
        sno: 1,
        name: "Dolo 650mg Tablet",
        hsn: "30049099",
        batchNo: "DL2609",
        expiry: "09/2028",
        qtyFormatted: "2 strips",
        mrp: "₹35.00",
        rate: "₹32.00",
        discount: "₹0.00",
        gstPct: "12%",
        amount: "₹64.00",
      },
      {
        sno: 2,
        name: "Augmentin 625 Duo",
        hsn: "30041020",
        batchNo: "AG8812",
        expiry: "05/2028",
        qtyFormatted: "1 strip",
        mrp: "₹231.00",
        rate: "₹201.00",
        discount: "₹15.00",
        gstPct: "12%",
        amount: "₹216.00",
      },
    ],
  };
}

