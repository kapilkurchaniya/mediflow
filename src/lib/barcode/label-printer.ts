export interface LabelPrintItem {
  storeName: string;
  medicineName: string;
  batchNo: string;
  expiryDate: string; // YYYY-MM-DD or MM/YY
  mrpPaise: number;
  barcode: string;
  copies?: number;
}

/**
 * Generates TSPL2 commands for TSC / thermal barcode label printers (50mm x 25mm sticker) (B9/J3).
 */
export function generateTsplLabel(item: LabelPrintItem): string {
  const mrpRs = (item.mrpPaise / 100).toFixed(2);
  const safeName = item.medicineName.replace(/"/g, "'").slice(0, 28);
  const safeStore = item.storeName.replace(/"/g, "'").slice(0, 24);
  const safeBatch = item.batchNo.replace(/"/g, "'").slice(0, 16);
  const copies = Math.max(1, item.copies ?? 1);

  return [
    "SIZE 50 mm, 25 mm",
    "GAP 2 mm, 0 mm",
    "DIRECTION 1",
    "CLS",
    `TEXT 16,12,"1",0,1,1,"${safeStore}"`,
    `TEXT 16,32,"2",0,1,1,"${safeName}"`,
    `TEXT 16,60,"1",0,1,1,"B:${safeBatch} EXP:${item.expiryDate}"`,
    `TEXT 16,80,"2",0,1,1,"MRP Rs.${mrpRs}"`,
    `BARCODE 16,110,"128",48,1,0,2,2,"${item.barcode}"`,
    `PRINT 1,${copies}`,
    "",
  ].join("\n");
}

/**
 * Generates ZPL II commands for Zebra / ZPL label printers (B9/J3).
 */
export function generateZplLabel(item: LabelPrintItem): string {
  const mrpRs = (item.mrpPaise / 100).toFixed(2);
  const safeName = item.medicineName.replace(/\^|~/g, "").slice(0, 28);
  const safeStore = item.storeName.replace(/\^|~/g, "").slice(0, 24);
  const copies = Math.max(1, item.copies ?? 1);

  return [
    "^XA",
    `^FO20,15^A0N,18,18^FD${safeStore}^FS`,
    `^FO20,38^A0N,22,22^FD${safeName}^FS`,
    `^FO20,66^A0N,18,18^FDB:${item.batchNo} EXP:${item.expiryDate}^FS`,
    `^FO20,88^A0N,22,22^FDMRP Rs.${mrpRs}^FS`,
    `^FO20,116^BY2^BCN,48,Y,N,N^FD${item.barcode}^FS`,
    `^PQ${copies}`,
    "^XZ",
    "",
  ].join("\n");
}
