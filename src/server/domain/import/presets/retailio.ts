/**
 * Retailio electronic distributor invoice column synonyms.
 * Common format across Indian pharmaceutical retailers ordering from distributors.
 */
export const RETAILIO_INVOICE_MAPPINGS: Record<string, string[]> = {
  name: ["Item Description", "Description", "Product_Description", "Item", "Product", "Product Name", "Item Name"],
  batchNo: ["Batch", "Batch_Number", "Lot", "Batch No.", "Batch No", "BATCH"],
  expiryDate: ["Expiry", "Exp_Date", "Exp Date", "Expiry_Date", "Exp", "EXP"],
  packaging: ["Pack", "Pack_Size", "Packing", "Pack Size", "PACK"],
  billedQty: ["Billed_Quantity", "Billed Qty", "Qty", "Quantity", "BilledQty", "QTY"],
  freeQty: ["Free_Quantity", "Free Qty", "Free", "FreeQty", "FREE"],
  rate: ["PTR", "Purchase_Price", "Rate", "Net Rate", "Net_Rate", "Price", "PUR_RATE"],
  mrp: ["MRP", "M.R.P", "M.R.P.", "Max Price"],
  discountPct: ["Discount", "Disc_Rate", "Discount_Perc", "Scheme", "Disc %", "Scheme %", "DISC%"],
  gstPct: ["Tax_Rate", "GST_Rate", "GST", "IGST/CGST/SGST", "Tax %", "GST %", "GST%"],
  hsn: ["HSN", "HSN_Code", "HSN Code", "HSN"],
  barcode: ["Barcode", "GTIN", "EAN", "Barcode_No", "BARCODE"],
};

