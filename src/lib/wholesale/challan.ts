/**
 * D-Block Wholesale Pack (D1–D4):
 * - B2B Delivery Challan -> GST Invoice conversion
 * - Salesman / Route dispatch packing slip
 * - e-Way Bill threshold evaluation (₹50,000)
 */
export interface WholesaleChallanLine {
  medicineId: string;
  medicineName: string;
  batchNo: string;
  qty: number;
  freeQty: number;
  ptrRatePaise: number;
  discountBp: number;
  gstRateBp: number;
}

export interface WholesaleChallan {
  challanNo: string;
  challanDate: string;
  buyerName: string;
  buyerGstin: string;
  routeName?: string;
  salesmanName?: string;
  transporterName?: string;
  lrNo?: string;
  lines: WholesaleChallanLine[];
}

export function convertChallanToWholesaleInvoiceSummary(challan: WholesaleChallan) {
  let taxablePaise = 0;
  let gstPaise = 0;
  let totalUnits = 0;
  let totalFreeUnits = 0;

  for (const line of challan.lines) {
    const gross = line.qty * line.ptrRatePaise;
    const discount = Math.round((gross * line.discountBp) / 10000);
    const taxable = gross - discount;
    const tax = Math.round((taxable * line.gstRateBp) / 10000);
    taxablePaise += taxable;
    gstPaise += tax;
    totalUnits += line.qty;
    totalFreeUnits += line.freeQty;
  }

  const grandTotalPaise = taxablePaise + gstPaise;
  const requiresEwayBill = grandTotalPaise >= 5000000; // ₹50,000 threshold

  return {
    challanNo: challan.challanNo,
    buyerName: challan.buyerName,
    buyerGstin: challan.buyerGstin,
    routeName: challan.routeName ?? null,
    salesmanName: challan.salesmanName ?? null,
    lrNo: challan.lrNo ?? null,
    totalUnits,
    totalFreeUnits,
    taxablePaise,
    gstPaise,
    grandTotalPaise,
    requiresEwayBill,
  };
}
