/**
 * GoFrugal Pharmacy POS header synonym dictionaries.
 */

export const GOFRUGAL_MEDICINE_MAPPINGS: Record<string, string[]> = {
  name: ["ItemName", "ItemDescription", "Item_Name", "ProductName"],
  code: ["ItemCode", "Item_Code", "ProductCode", "SKU"],
  packaging: ["PackSize", "Packing", "Pack_Size", "UOM"],
  manufacturerName: ["Manufacturer", "MfrName", "Company", "Brand"],
  composition: ["GenericName", "Salt", "Composition", "SaltName"],
  hsn: ["HSNCode", "HSN_Code", "HSN"],
  gstRate: ["TaxPercentage", "TaxRate", "GSTPercentage", "GST%"],
  mrp: ["MRP", "MaxRetailPrice", "M.R.P"],
  saleRate: ["SaleRate", "SellingPrice", "UnitPrice", "Rate"],
  purchaseCost: ["PurchaseRate", "PurchaseCost", "CostPrice", "Cost"],
  rackLocation: ["BinLocation", "RackNo", "ShelfLocation", "Rack"],
  schedule: ["Schedule", "DrugSchedule", "ScheduleType"],
  barcode: ["Barcode", "EANCode", "UPCCode"],
};

export const GOFRUGAL_BATCH_MAPPINGS: Record<string, string[]> = {
  medicineCodeOrName: ["ItemName", "ItemCode", "Product"],
  batchNo: ["BatchNo", "BatchNumber", "LotNo", "Batch"],
  expiryDate: ["ExpiryDate", "ExpDate", "Expiry"],
  openingQty: ["OpeningStock", "OpeningQty"],
  closingQty: ["CurrentStock", "ClosingStock", "Quantity", "QtyOnHand"],
  mrp: ["MRP", "MaxRetailPrice"],
  purchaseRate: ["PurchaseRate", "CostPrice"],
  saleRate: ["SaleRate", "SellingPrice"],
};

export const GOFRUGAL_PARTY_MAPPINGS: Record<string, string[]> = {
  name: ["AccountName", "CustomerName", "VendorName", "PartyName"],
  code: ["AccountCode", "CustomerCode", "VendorCode"],
  city: ["City", "Town"],
  address: ["AddressLine1", "Address", "BillingAddress"],
  phone: ["Phone", "Landline", "Telephone"],
  mobile: ["MobileNo", "Mobile", "ContactNumber"],
  dlNo: ["DrugLicenseNo", "DLNumber"],
  gstin: ["GSTIN", "GSTNumber", "TaxId"],
  openingBalance: ["OpeningBalance", "BalanceAmount"],
  creditLimit: ["CreditLimit", "MaxCredit"],
};

