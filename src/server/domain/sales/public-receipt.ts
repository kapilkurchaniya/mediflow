import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { verifyReceiptToken } from "@/lib/receipt-token";

export interface PublicReceiptItem {
  id: string;
  medicineName: string;
  batchNo: string;
  expiryDate: string;
  hsn: string | null;
  qty: number;
  packUnit: string;
  packQty: number;
  looseQty: number;
  mrp: number; // in integer paise
  rate: number; // in integer paise (per unit sale price to patient)
  discountAmount: number; // in integer paise
  taxableAmount: number; // in integer paise
  gstRateBp: number; // basis points (e.g. 1200 = 12%)
  cgst: number; // in integer paise
  sgst: number; // in integer paise
  igst: number; // in integer paise
  totalAmount: number; // in integer paise
}

export interface PublicReceiptData {
  sale: {
    id: string;
    invoiceNo: string;
    status: string; // completed | cancelled
    isCancelled: boolean;
    cancelReason: string | null;
    completedAt: Date | string | null;
    createdAt: Date | string | null;
    customerName: string;
    maskedCustomerPhone: string | null;
    doctorName: string | null;
    doctorRegNo: string | null;
    grossAmount: number;
    discountAmount: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    roundOff: number;
    totalAmount: number;
    paidAmount: number;
    creditAmount: number;
  };
  items: PublicReceiptItem[];
  payments: Array<{
    method: string;
    amount: number;
    status: string;
  }>;
  store: {
    name: string;
    address: string | null;
    city: string | null;
    stateCode: string;
    pincode: string | null;
    phone: string | null;
    gstin: string | null;
    drugLicenseNo: string | null;
    fssaiNo: string | null;
  };
  pharmacyBrandName: string;
}

/**
 * Masks a 10-digit Indian mobile number for patient privacy: "9876543210" -> "98*****210"
 */
export function maskPhoneNumber(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    return `${last10.slice(0, 2)}*****${last10.slice(-3)}`;
  }
  return "****";
}

/**
 * Fetches sanitized, read-only invoice data for the public receipt link.
 * Strictly guarantees that wholesale purchase rates, supplier details,
 * pharmacy profit margins, and internal cost codes are NEVER exposed.
 */
export async function getPublicReceiptData(
  token: string
): Promise<{ success: true; data: PublicReceiptData } | { success: false; error: string }> {
  const tokenRes = verifyReceiptToken(token);
  if (!tokenRes.valid) {
    return { success: false, error: tokenRes.error };
  }

  const { saleId, tenantId } = tokenRes;

  const [sale] = await db
    .select({
      id: schema.sales.id,
      storeId: schema.sales.storeId,
      invoiceNo: schema.sales.invoiceNo,
      status: schema.sales.status,
      cancelReason: schema.sales.cancelReason,
      completedAt: schema.sales.completedAt,
      createdAt: schema.sales.createdAt,
      customerName: schema.sales.customerName,
      customerPhone: schema.sales.customerPhone,
      doctorName: schema.sales.doctorName,
      doctorRegNo: schema.sales.doctorRegNo,
      grossAmount: schema.sales.grossAmount,
      discountAmount: schema.sales.discountAmount,
      taxableAmount: schema.sales.taxableAmount,
      cgst: schema.sales.cgst,
      sgst: schema.sales.sgst,
      igst: schema.sales.igst,
      roundOff: schema.sales.roundOff,
      totalAmount: schema.sales.totalAmount,
      paidAmount: schema.sales.paidAmount,
      creditAmount: schema.sales.creditAmount,
    })
    .from(schema.sales)
    .where(and(eq(schema.sales.id, saleId), eq(schema.sales.tenantId, tenantId)))
    .limit(1);

  if (!sale) {
    return { success: false, error: "Invoice not found or no longer available" };
  }

  // Fetch items strictly selecting patient-facing fields (NO unitCost or margin)
  const items = await db
    .select({
      id: schema.saleItems.id,
      medicineName: schema.saleItems.medicineName,
      batchNo: schema.saleItems.batchNo,
      expiryDate: schema.saleItems.expiryDate,
      hsn: schema.saleItems.hsn,
      qty: schema.saleItems.qty,
      packUnit: schema.saleItems.packUnit,
      packQty: schema.saleItems.packQty,
      looseQty: schema.saleItems.looseQty,
      mrp: schema.saleItems.mrp,
      rate: schema.saleItems.rate,
      discountAmount: schema.saleItems.discountAmount,
      taxableAmount: schema.saleItems.taxableAmount,
      gstRateBp: schema.saleItems.gstRateBp,
      cgst: schema.saleItems.cgst,
      sgst: schema.saleItems.sgst,
      igst: schema.saleItems.igst,
      totalAmount: schema.saleItems.totalAmount,
    })
    .from(schema.saleItems)
    .where(and(eq(schema.saleItems.saleId, saleId), eq(schema.saleItems.tenantId, tenantId)));

  // Fetch store details
  const [store] = await db
    .select({
      name: schema.stores.name,
      address: schema.stores.address,
      city: schema.stores.city,
      stateCode: schema.stores.stateCode,
      pincode: schema.stores.pincode,
      phone: schema.stores.phone,
      gstin: schema.stores.gstin,
      drugLicenseNo: schema.stores.drugLicenseNo,
      fssaiNo: schema.stores.fssaiNo,
    })
    .from(schema.stores)
    .where(and(eq(schema.stores.id, sale.storeId), eq(schema.stores.tenantId, tenantId)))
    .limit(1);

  // Fetch payments
  const payments = await db
    .select({
      method: schema.salePayments.method,
      amount: schema.salePayments.amount,
      status: schema.salePayments.status,
    })
    .from(schema.salePayments)
    .where(and(eq(schema.salePayments.saleId, saleId), eq(schema.salePayments.tenantId, tenantId)));

  // Fetch tenant brand name
  const [tenant] = await db
    .select({ name: schema.tenants.name })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  return {
    success: true,
    data: {
      sale: {
        id: sale.id,
        invoiceNo: sale.invoiceNo || "INV-COUNTER",
        status: sale.status,
        isCancelled: sale.status === "cancelled",
        cancelReason: sale.cancelReason,
        completedAt: sale.completedAt,
        createdAt: sale.createdAt,
        customerName: sale.customerName || "Valued Customer",
        maskedCustomerPhone: maskPhoneNumber(sale.customerPhone),
        doctorName: sale.doctorName,
        doctorRegNo: sale.doctorRegNo,
        grossAmount: sale.grossAmount || 0,
        discountAmount: sale.discountAmount || 0,
        taxableAmount: sale.taxableAmount || 0,
        cgst: sale.cgst || 0,
        sgst: sale.sgst || 0,
        igst: sale.igst || 0,
        roundOff: sale.roundOff || 0,
        totalAmount: sale.totalAmount || 0,
        paidAmount: sale.paidAmount || 0,
        creditAmount: sale.creditAmount || 0,
      },
      items: items.map((it) => ({
        id: it.id,
        medicineName: it.medicineName,
        batchNo: it.batchNo,
        expiryDate: it.expiryDate,
        hsn: it.hsn,
        qty: it.qty,
        packUnit: it.packUnit,
        packQty: it.packQty,
        looseQty: it.looseQty,
        mrp: it.mrp || 0,
        rate: it.rate || 0,
        discountAmount: it.discountAmount || 0,
        taxableAmount: it.taxableAmount || 0,
        gstRateBp: it.gstRateBp,
        cgst: it.cgst || 0,
        sgst: it.sgst || 0,
        igst: it.igst || 0,
        totalAmount: it.totalAmount || 0,
      })),
      payments: payments.map((p) => ({
        method: p.method,
        amount: p.amount || 0,
        status: p.status,
      })),
      store: {
        name: store?.name || tenant?.name || "MediFlow Pharmacy",
        address: store?.address || null,
        city: store?.city || null,
        stateCode: store?.stateCode || "27",
        pincode: store?.pincode || null,
        phone: store?.phone || null,
        gstin: store?.gstin || null,
        drugLicenseNo: store?.drugLicenseNo || null,
        fssaiNo: store?.fssaiNo || null,
      },
      pharmacyBrandName: tenant?.name || store?.name || "MediFlow Pharmacy",
    },
  };
}

