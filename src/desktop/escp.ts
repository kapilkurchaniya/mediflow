import type { SalePrintData, DotMatrixPrintOptions } from "./types";

/**
 * Pure Epson ESC/P & ESC/P 2 Binary Command Formatter for 80-column dot-matrix printers.
 * Generates character-mode raw bytes for Epson LX-300+II, LX-310, TVS MSP 240, FX-890.
 */

const ESC = 0x1b;
const SI = 0x0f;
const DC2 = 0x12;
const FF = 0x0c;
const CR = 0x0d;
const LF = 0x0a;

export const ESCP_COMMANDS = {
  RESET: new Uint8Array([ESC, 0x40]),
  PITCH_10_CPI: new Uint8Array([ESC, 0x50]),
  PITCH_12_CPI: new Uint8Array([ESC, 0x4d]),
  CONDENSED_ON: new Uint8Array([SI]),
  CONDENSED_OFF: new Uint8Array([DC2]),
  LINE_SPACING_1_6: new Uint8Array([ESC, 0x32]),
  LINE_SPACING_1_8: new Uint8Array([ESC, 0x30]),
  BOLD_ON: new Uint8Array([ESC, 0x45]),
  BOLD_OFF: new Uint8Array([ESC, 0x46]),
  DOUBLE_STRIKE_ON: new Uint8Array([ESC, 0x47]),
  DOUBLE_STRIKE_OFF: new Uint8Array([ESC, 0x48]),
  FORM_FEED: new Uint8Array([FF]),
  NEWLINE: new Uint8Array([CR, LF]),
};

export class EscPBuilder {
  private chunks: Uint8Array[] = [];
  private encoder = new TextEncoder();

  add(bytes: Uint8Array): this {
    this.chunks.push(bytes);
    return this;
  }

  text(str: string): this {
    this.chunks.push(this.encoder.encode(str));
    return this;
  }

  line(str = ""): this {
    if (str) this.text(str);
    this.chunks.push(ESCP_COMMANDS.NEWLINE);
    return this;
  }

  bold(enabled: boolean): this {
    return this.add(enabled ? ESCP_COMMANDS.BOLD_ON : ESCP_COMMANDS.BOLD_OFF);
  }

  center(str: string, width = 80): this {
    const pad = Math.max(0, Math.floor((width - str.length) / 2));
    return this.line(" ".repeat(pad) + str);
  }

  row(left: string, right: string, width = 80): this {
    const spaces = Math.max(1, width - left.length - right.length);
    return this.line(left + " ".repeat(spaces) + right);
  }

  separator(width = 80, char = "-"): this {
    return this.line(char.repeat(width));
  }

  formFeed(): this {
    return this.add(ESCP_COMMANDS.FORM_FEED);
  }

  build(): Uint8Array {
    let total = 0;
    for (const c of this.chunks) total += c.length;
    const buf = new Uint8Array(total);
    let offset = 0;
    for (const c of this.chunks) {
      buf.set(c, offset);
      offset += c.length;
    }
    return buf;
  }
}

function fmtPaise(p: number): string {
  return (p / 100).toFixed(2);
}

function formatQty(packQty: number, looseQty: number): string {
  if (packQty > 0 && looseQty > 0) return `${packQty}p+${looseQty}t`;
  if (packQty > 0) return `${packQty} pack`;
  return `${looseQty} tab`;
}

export function buildEscPDotMatrixInvoice(data: SalePrintData, options?: DotMatrixPrintOptions): Uint8Array {
  const b = new EscPBuilder().add(ESCPPITCH(options));

  // 1. Pharmacy Header
  b.bold(true).center(data.storeName.toUpperCase()).bold(false);
  if (data.storeAddress) b.center(data.storeAddress);
  const contactParts: string[] = [];
  if (data.storePhone) contactParts.push(`Ph: ${data.storePhone}`);
  if (data.storeGstin) contactParts.push(`GSTIN: ${data.storeGstin}`);
  if (contactParts.length > 0) b.center(contactParts.join(" | "));
  if (data.storeDlNumbers && data.storeDlNumbers.length > 0) {
    b.center(`D.L. Nos: ${data.storeDlNumbers.join(", ")}`);
  }
  b.bold(true).center("TAX INVOICE (CASH / CREDIT)").bold(false);
  b.separator(80, "=");

  // 2. Invoice Meta Row
  const dStr = new Date(data.completedAt).toLocaleString();
  b.row(`Invoice No: ${data.invoiceNo}`, `Date/Time: ${dStr}`);
  const custLeft = `Patient: ${data.patientName || "Cash Customer"}`;
  const docRight = `Doctor: ${data.doctorName || "Self"}`;
  b.row(custLeft, docRight);
  if (data.customerGstin) {
    b.line(`Buyer GSTIN: ${data.customerGstin}`);
  }

  // 3. 80-Column Grid Border & Header
  b.separator(80, "-");
  b.bold(true).line(
    "| # | Product Particulars   | Batch    | Exp  | Qty    | Rate   | GST% | Total Rs |",
  ).bold(false);
  b.separator(80, "-");

  // 4. Line Items (Column widths: 3, 23, 10, 6, 8, 8, 6, 10)
  data.items.forEach((it, idx) => {
    const sNo = String(idx + 1).padStart(2);
    const name = it.name.slice(0, 21).padEnd(21);
    const batch = it.batchNo.slice(0, 8).padEnd(8);
    const exp = it.expiryDate.slice(2, 7); // YY-MM
    const qty = formatQty(it.packQty, it.looseQty).slice(0, 6).padStart(6);
    const rate = fmtPaise(it.ratePaise).padStart(6);
    const gst = `${(it.gstRateBp / 100).toFixed(0)}%`.padStart(4);
    const amt = fmtPaise(it.amountPaise).padStart(8);

    b.line(`|${sNo} | ${name} | ${batch} |${exp}| ${qty} | ${rate} | ${gst} | ${amt} |`);
  });

  b.separator(80, "-");

  // 5. Totals & Tax Summary Table
  const itemsCount = data.items.length;
  b.row(
    `Items: ${itemsCount} | Gross: Rs ${fmtPaise(data.grossPaise)}`,
    `Taxable Amount: Rs ${fmtPaise(data.taxablePaise)}`,
  );
  if (data.discountPaise > 0) {
    b.row(`Bill Discount: -Rs ${fmtPaise(data.discountPaise)}`, "");
  }

  const taxDetails: string[] = [];
  if (data.cgstPaise > 0) taxDetails.push(`CGST: Rs ${fmtPaise(data.cgstPaise)}`);
  if (data.sgstPaise > 0) taxDetails.push(`SGST: Rs ${fmtPaise(data.sgstPaise)}`);
  if (data.igstPaise && data.igstPaise > 0) taxDetails.push(`IGST: Rs ${fmtPaise(data.igstPaise)}`);
  if (taxDetails.length > 0) {
    b.line(taxDetails.join(" | "));
  }

  if (data.roundOffPaise !== 0) {
    b.row(
      `Round-Off: ${data.roundOffPaise > 0 ? "+" : ""}Rs ${fmtPaise(data.roundOffPaise)}`,
      "",
    );
  }

  b.separator(80, "=");
  b.bold(true).row(
    `NET AMOUNT PAYABLE: Rs ${fmtPaise(data.totalPaise)}`,
    data.payments.map((p) => `${p.method.toUpperCase()}: ${fmtPaise(p.amountPaise)}`).join(" "),
  ).bold(false);
  b.separator(80, "=");

  // 6. Statutory Disclaimer & Pharmacist Signature Block
  b.line("Goods once sold will not be taken back without original bill & intact batch.");
  b.row("Cashier: " + (data.cashierName || "admin"), "Registered Pharmacist Signature");

  // 7. Form feed to advance tractor feeder to next page perforation
  if (options?.formFeed !== false) {
    b.formFeed();
  }

  return b.build();
}

function ESCPPITCH(opts?: DotMatrixPrintOptions): Uint8Array {
  if (opts?.pitch === "condensed") return ESCP_COMMANDS.CONDENSED_ON;
  if (opts?.pitch === "12cpi") return ESCP_COMMANDS.PITCH_12_CPI;
  return ESCP_COMMANDS.PITCH_10_CPI;
}
