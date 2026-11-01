/**
 * Marg ERP header synonym dictionaries.
 * Formulated from real Marg item master, party master, and stock ledger exports.
 */

export const MARG_MEDICINE_MAPPINGS: Record<string, string[]> = {
  name: [
    "ITEM NAME",
    "ITEM_DESCRIPTION",
    "ITEMNAME",
    "PRODUCT",
    "PRODUCT NAME",
    "PARTICULARS",
    "DESCRIPTION",
  ],
  code: ["CODE", "ITEM_CODE", "ITEMCODE", "PROD CODE", "PROD_CODE", "ITEM NO"],
  packaging: ["PACKING", "PACKING_INFO", "PACK", "PACK SIZE", "PKG"],
  manufacturerName: ["COMPANY", "MFR_NAME", "MFR", "MFG", "MFG BY", "COMPANY NAME"],
  composition: ["SALT", "COMPOSITION", "GENERIC", "GENERIC NAME", "SALT COMPOSITION"],
  hsn: ["HSN", "HSN_SAC", "HSN CODE", "HSN/SAC", "HSNCODE"],
  gstRate: ["GST%", "TAX_RATE", "GST RATE", "GST", "TAX%", "VAT%"],
  mrp: ["MRP", "MAX_RETAIL_PRICE", "M.R.P.", "M.R.P"],
  saleRate: ["RATE", "SELLING_RATE", "S_RATE", "SALE RATE", "S.RATE"],
  purchaseCost: ["COST", "PURCHASE_COST", "P_RATE", "PUR RATE", "PUR.RATE", "P.RATE"],
  rackLocation: ["RACK", "RACK_LOCATION", "RACK NO", "LOCATION", "SHELF", "SHELF NO"],
  schedule: ["SCHEDULE", "SCHEDULE_TYPE", "DRUG TYPE", "SCHEDULE H1", "SCH"],
  barcode: ["BARCODE", "BAR CODE", "EAN", "UPC"],
};

export const MARG_BATCH_MAPPINGS: Record<string, string[]> = {
  medicineCodeOrName: [
    "ITEM NAME",
    "ITEM CODE",
    "ITEM_DESCRIPTION",
    "PRODUCT",
    "PARTICULARS",
  ],
  batchNo: ["BATCH NO", "BATCH_NO", "BATCH", "BATCHNO", "B.NO", "LOT NO"],
  expiryDate: ["EXPIRY", "EXP_DATE", "EXP.DATE", "EXPIRY DATE", "EXP", "EXPDATE"],
  openingQty: ["OP QTY", "OP.QTY", "OPENING QTY", "OPENING", "OPENING STOCK"],
  closingQty: [
    "CLOSING QTY",
    "CLOSING",
    "QTY",
    "QUANTITY",
    "STOCK",
    "STOCK QTY",
    "BALANCE QTY",
  ],
  mrp: ["MRP", "MAX_RETAIL_PRICE", "M.R.P."],
  purchaseRate: ["PUR RATE", "PUR.RATE", "PURCHASE_COST", "COST", "P_RATE"],
  saleRate: ["RATE", "SELLING_RATE", "S_RATE", "SALE RATE"],
};

export const MARG_PARTY_MAPPINGS: Record<string, string[]> = {
  name: ["PARTY NAME", "PARTY_NAME", "NAME", "CUSTOMER NAME", "SUPPLIER NAME", "PARTY"],
  code: ["PARTY CODE", "PARTY_CODE", "CODE", "CUST CODE", "SUPP CODE", "ACC NO"],
  city: ["STATION", "CITY", "TOWN", "LOCATION"],
  address: ["ADDRESS", "ADDRESS 1", "STREET"],
  phone: ["PHONE", "TELEPHONE", "TEL NO", "PHONE NO"],
  mobile: ["MOBILE", "MOBILE NO", "CONTACT NO", "CELL"],
  dlNo: ["DL NO 1", "DL NO 2", "DL NO", "DRUG LICENSE", "DRUG LIC NO"],
  gstin: ["GSTIN", "GST NO", "GST_NO", "TIN", "GSTIN/UIN"],
  type: ["TYPE", "PARTY TYPE", "CATEGORY"],
  openingBalance: ["BALANCE", "OP BALANCE", "OPENING BALANCE", "OPENING BAL"],
  creditLimit: ["CR_LIMIT", "CREDIT LIMIT", "LIMIT"],
};

