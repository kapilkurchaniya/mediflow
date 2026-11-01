/**
 * Generic standard CSV header synonym mappings.
 */

export const GENERIC_MEDICINE_MAPPINGS: Record<string, string[]> = {
  name: ["name", "medicine_name", "title", "item"],
  code: ["code", "sku", "id", "item_code"],
  packaging: ["packaging", "pack", "unit", "pack_size"],
  manufacturerName: ["manufacturer", "company", "brand", "mfr"],
  composition: ["composition", "salt", "generic"],
  hsn: ["hsn", "hsn_code"],
  gstRate: ["gst", "gst_rate", "tax", "tax_rate"],
  mrp: ["mrp", "max_price"],
  saleRate: ["sale_rate", "price", "rate"],
  purchaseCost: ["purchase_cost", "cost", "purchase_rate"],
  rackLocation: ["rack", "shelf", "location"],
  schedule: ["schedule", "drug_schedule"],
  barcode: ["barcode", "ean"],
};

export const GENERIC_BATCH_MAPPINGS: Record<string, string[]> = {
  medicineCodeOrName: ["medicine", "item", "product"],
  batchNo: ["batch_no", "batch", "lot"],
  expiryDate: ["expiry_date", "expiry", "exp"],
  openingQty: ["opening_qty", "opening_stock"],
  closingQty: ["qty", "closing_qty", "stock", "quantity"],
  mrp: ["mrp"],
  purchaseRate: ["purchase_rate", "cost"],
  saleRate: ["sale_rate", "rate"],
};

export const GENERIC_PARTY_MAPPINGS: Record<string, string[]> = {
  name: ["name", "party_name"],
  code: ["code", "party_code"],
  city: ["city", "station"],
  address: ["address"],
  phone: ["phone", "landline"],
  mobile: ["mobile", "cell"],
  dlNo: ["dl_no", "drug_license"],
  gstin: ["gstin", "gst"],
  openingBalance: ["opening_balance", "balance"],
  creditLimit: ["credit_limit"],
};

