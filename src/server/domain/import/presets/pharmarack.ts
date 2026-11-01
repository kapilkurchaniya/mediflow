/**
 * Pharmarack electronic distributor invoice column synonyms.
 * Common format across Indian pharmaceutical stockists and B2B portals.
 */
export const PHARMARACK_INVOICE_MAPPINGS: Record<string, string[]> = {
  name: ["Item Name", "Product Name", "Product", "Item Description", "Item_Name", "PROD_NAME", "Description"],
  batchNo: ["Batch No", "Batch", "Batch_No", "BatchNo", "B.No", "BATCH_NO", "Batch Number", "Lot No"],
  expiryDate: ["Expiry Date", "Expiry", "Exp Date", "Exp_Date", "Exp", "EXPIRY_DATE", "Exp. Date", "Exp Dt"],
  packaging: ["Pack", "Packing", "Pack Size", "PACK_SIZE", "PKG", "Pack_Size", "Pack Unit"],
  billedQty: ["Billed Qty", "Qty", "Quantity", "Billed_Qty", "Bill Qty", "BILL_QTY", "BILLED QUANTITY", "Inv Qty"],
  freeQty: ["Free Qty", "Free", "Free_Qty", "F.Qty", "FREE_QTY", "FREE QUANTITY", "Scheme Qty", "Free Items"],
  rate: ["PTR", "Rate", "Purchase Rate", "Pur Rate", "Price To Retailer", "P.Rate", "PURCHASE_RATE", "Price", "Unit Rate"],
  mrp: ["MRP", "M.R.P.", "Max Retail Price", "M.R.P"],
  discountPct: ["Scheme %", "Disc %", "Discount %", "Scheme", "Discount", "DISC_PERC", "SCHEME_PCT", "Disc %.", "Trade Disc %"],
  gstPct: ["GST %", "GST", "GST Rate", "Tax %", "Tax", "GST_PERC", "TAX_PCT", "GST RATE", "Vat %"],
  hsn: ["HSN", "HSN Code", "HSN_CODE", "HSN/SAC", "Tariff"],
  barcode: ["Barcode", "EAN", "UPC", "Item Code", "Product Code", "BARCODE", "EAN_CODE", "GTIN"],
};
