import type { SalePrintData, ThermalPrintOptions } from "./types";

/**
 * Pure ESC/POS Binary Command Formatter for 58mm & 80mm thermal receipt printers.
 * Generates raw bytes compliant with Epson ESC/POS standards.
 */

const ESC = 0x1b;
const GS = 0x1d;

export const ESCPOS_COMMANDS = {
  INIT: new Uint8Array([ESC, 0x40]),
  ALIGN_LEFT: new Uint8Array([ESC, 0x61, 0x00]),
  ALIGN_CENTER: new Uint8Array([ESC, 0x61, 0x01]),
  ALIGN_RIGHT: new Uint8Array([ESC, 0x61, 0x02]),
  BOLD_ON: new Uint8Array([ESC, 0x45, 0x01]),
  BOLD_OFF: new Uint8Array([ESC, 0x45, 0x00]),
  SIZE_NORMAL: new Uint8Array([GS, 0x21, 0x00]),
  SIZE_DOUBLE: new Uint8Array([GS, 0x21, 0x11]),
  SIZE_DOUBLE_HEIGHT: new Uint8Array([GS, 0x21, 0x01]),
  DRAWER_PIN2: new Uint8Array([ESC, 0x70, 0x00, 0x19, 0xfa]),
  DRAWER_PIN5: new Uint8Array([ESC, 0x70, 0x01, 0x19, 0xfa]),
  CUT_PARTIAL: new Uint8Array([GS, 0x56, 0x42, 0x00]),
  CUT_FULL: new Uint8Array([GS, 0x56, 0x41, 0x00]),
  LINE_FEED: new Uint8Array([0x0a]),
};

export class EscPosBuilder {
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
    this.chunks.push(ESCPOS_COMMANDS.LINE_FEED);
    return this;
  }

  bold(enabled: boolean): this {
    return this.add(enabled ? ESCPOS_COMMANDS.BOLD_ON : ESCPOS_COMMANDS.BOLD_OFF);
  }

  align(alignment: "left" | "center" | "right"): this {
    if (alignment === "center") return this.add(ESCPOS_COMMANDS.ALIGN_CENTER);
    if (alignment === "right") return this.add(ESCPOS_COMMANDS.ALIGN_RIGHT);
    return this.add(ESCPOS_COMMANDS.ALIGN_LEFT);
  }

  size(mode: "normal" | "double" | "tall"): this {
    if (mode === "double") return this.add(ESCPOS_COMMANDS.SIZE_DOUBLE);
    if (mode === "tall") return this.add(ESCPOS_COMMANDS.SIZE_DOUBLE_HEIGHT);
    return this.add(ESCPOS_COMMANDS.SIZE_NORMAL);
  }

  separator(cols: number, char = "-"): this {
    return this.line(char.repeat(cols));
  }

  row(cols: number, left: string, right: string): this {
    const spaces = Math.max(1, cols - left.length - right.length);
    return this.line(left + " ".repeat(spaces) + right);
  }

  qrCode(payload: string): this {
    const data = this.encoder.encode(payload);
    const pL = (data.length + 3) & 0xff;
    const pH = ((data.length + 3) >> 8) & 0xff;
    // 1. Model 2
    this.add(new Uint8Array([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]));
    // 2. Module size = 4
    this.add(new Uint8Array([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x04]));
    // 3. Error correction M
    this.add(new Uint8Array([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]));
    // 4. Store data
    const storeHeader = new Uint8Array([GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]);
    this.add(storeHeader);
    this.add(data);
    // 5. Print QR
    this.add(new Uint8Array([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]));
    return this.line();
  }

  build(): Uint8Array {
    let totalLength = 0;
    for (const c of this.chunks) totalLength += c.length;
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const c of this.chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    return result;
  }
}

function fmtPaise(p: number): string {
  return (p / 100).toFixed(2);
}

function formatQty(packQty: number, looseQty: number, packUnit = "pk", looseUnit = "tab"): string {
  if (packQty > 0 && looseQty > 0) return `${packQty}${packUnit}+${looseQty}${looseUnit}`;
  if (packQty > 0) return `${packQty} ${packUnit}`;
  return `${looseQty} ${looseUnit}`;
}

export function buildEscPosReceipt(data: SalePrintData, options?: ThermalPrintOptions): Uint8Array {
  const cols = options?.widthCols === 32 ? 32 : 48;
  const b = new EscPosBuilder().add(ESCPOS_COMMANDS.INIT);

  // 1. Kick Drawer if requested
  if (options?.kickDrawer) {
    b.add(ESCPOS_COMMANDS.DRAWER_PIN2);
  }

  // 2. Pharmacy Header
  b.align("center").bold(true).size("double").line(data.storeName).size("normal").bold(false);
  if (data.storeAddress) b.line(data.storeAddress);
  if (data.storePhone) b.line(`Ph: ${data.storePhone}`);
  if (data.storeGstin) b.line(`GSTIN: ${data.storeGstin}`);
  if (data.storeDlNumbers && data.storeDlNumbers.length > 0) {
    b.line(`DL: ${data.storeDlNumbers.join(", ")}`);
  }
  b.separator(cols, "=");

  // 3. Invoice Meta
  b.align("left");
  b.row(cols, `Invoice: ${data.invoiceNo}`, new Date(data.completedAt).toLocaleDateString());
  if (data.cashierName) b.line(`Cashier: ${data.cashierName}`);
  if (data.patientName) b.line(`Patient: ${data.patientName}`);
  if (data.doctorName) b.line(`Doctor: ${data.doctorName}`);
  b.separator(cols, "-");

  // 4. Line Items Table
  if (cols === 48) {
    b.bold(true).line("Item                Batch      Qty    Rate   Total").bold(false);
    b.separator(cols, "-");
    for (const it of data.items) {
      const name = it.name.slice(0, 19).padEnd(20);
      const batch = it.batchNo.slice(0, 10).padEnd(11);
      const qty = formatQty(it.packQty, it.looseQty, it.packUnit, it.looseUnit).slice(0, 5).padStart(5);
      const rate = fmtPaise(it.ratePaise).padStart(6);
      const amt = fmtPaise(it.amountPaise).padStart(6);
      b.line(`${name}${batch}${qty} ${rate} ${amt}`);
    }
  } else {
    // 32-col layout (58mm printer)
    for (const it of data.items) {
      b.bold(true).line(it.name.slice(0, 32)).bold(false);
      const qtyStr = formatQty(it.packQty, it.looseQty, it.packUnit, it.looseUnit);
      const left = `B:${it.batchNo.slice(0, 8)} ${qtyStr}`;
      const right = `@${fmtPaise(it.ratePaise)} = ${fmtPaise(it.amountPaise)}`;
      b.row(cols, left, right);
    }
  }
  b.separator(cols, "-");

  // 5. Totals & Tax Summary
  b.row(cols, "Gross Total:", `Rs ${fmtPaise(data.grossPaise)}`);
  if (data.discountPaise > 0) {
    b.row(cols, "Discount:", `-Rs ${fmtPaise(data.discountPaise)}`);
  }
  if (data.roundOffPaise !== 0) {
    b.row(cols, "Round Off:", `${data.roundOffPaise > 0 ? "+" : ""}Rs ${fmtPaise(data.roundOffPaise)}`);
  }
  b.bold(true).size("tall").row(cols, "NET PAYABLE:", `Rs ${fmtPaise(data.totalPaise)}`).size("normal").bold(false);

  // 6. Payment Modes
  if (data.payments.length > 0) {
    b.separator(cols, ".");
    const pmts = data.payments.map((p) => `${p.method.toUpperCase()}: ${fmtPaise(p.amountPaise)}`).join(" | ");
    b.line(pmts);
  }

  // 7. UPI Dynamic QR
  if (options?.printUpiQr !== false && data.upiQrPayload) {
    b.line().align("center").qrCode(data.upiQrPayload);
    b.line("Scan to Pay via UPI");
  }

  // 8. Footer & Paper Cut
  b.align("center").line("Thank you! Get well soon.").line();
  if (options?.cutPaper !== false) {
    b.line().line().add(ESCPOS_COMMANDS.CUT_PARTIAL);
  }

  return b.build();
}
