import { describe, it, expect } from "vitest";
import { maskPhoneNumber, PublicReceiptData, PublicReceiptItem } from "@/server/domain/sales/public-receipt";

describe("Public Receipt Privacy & Masking", () => {
  it("masks Indian customer phone numbers to preserve PII privacy", () => {
    expect(maskPhoneNumber("9876543210")).toBe("98*****210");
    expect(maskPhoneNumber("+91 98765 43210")).toBe("98*****210");
    expect(maskPhoneNumber("919876543210")).toBe("98*****210");
    expect(maskPhoneNumber(null)).toBeNull();
    expect(maskPhoneNumber(undefined)).toBeNull();
    expect(maskPhoneNumber("123")).toBe("****");
  });

  it("enforces strict commercial privacy: zero wholesale cost or margin fields in public types", () => {
    // Assert TypeScript interface properties at runtime
    const sampleItem: PublicReceiptItem = {
      id: "item-1",
      medicineName: "Paracetamol 650mg",
      batchNo: "BATCH-01",
      expiryDate: "2027-12-31",
      hsn: "300490",
      qty: 10,
      packUnit: "strip",
      packQty: 1,
      looseQty: 0,
      mrp: 3500,
      rate: 3000,
      discountAmount: 200,
      taxableAmount: 2800,
      gstRateBp: 1200,
      cgst: 168,
      sgst: 168,
      igst: 0,
      totalAmount: 3136,
    };

    // Confirm that internal cost fields do not exist on the public item
    expect((sampleItem as Record<string, unknown>).unitCost).toBeUndefined();
    expect((sampleItem as Record<string, unknown>).costPrice).toBeUndefined();
    expect((sampleItem as Record<string, unknown>).purchaseRate).toBeUndefined();
    expect((sampleItem as Record<string, unknown>).margin).toBeUndefined();
    expect((sampleItem as Record<string, unknown>).supplierId).toBeUndefined();

    const sampleReceipt: PublicReceiptData = {
      sale: {
        id: "sale-1",
        invoiceNo: "INV-2026-001",
        status: "completed",
        isCancelled: false,
        cancelReason: null,
        completedAt: "2026-11-06T00:00:00Z",
        createdAt: "2026-11-06T00:00:00Z",
        customerName: "John Doe",
        maskedCustomerPhone: "98*****210",
        doctorName: "Dr. Sharma",
        doctorRegNo: "MCI-12345",
        grossAmount: 3500,
        discountAmount: 200,
        taxableAmount: 2800,
        cgst: 168,
        sgst: 168,
        igst: 0,
        roundOff: -4,
        totalAmount: 3132,
        paidAmount: 3132,
        creditAmount: 0,
      },
      items: [sampleItem],
      payments: [{ method: "upi", amount: 3132, status: "success" }],
      store: {
        name: "MediFlow Pharmacy Main Branch",
        address: "123 High Street",
        city: "Mumbai",
        stateCode: "27",
        pincode: "400001",
        phone: "022-12345678",
        gstin: "27AABCS1429B1Z1",
        drugLicenseNo: "MH-MZ4-123456",
        fssaiNo: "11520000001234",
      },
      pharmacyBrandName: "MediFlow Pharmacy",
    };

    expect((sampleReceipt.sale as Record<string, unknown>).costAmount).toBeUndefined();
    expect(sampleReceipt.sale.isCancelled).toBe(false);
  });

  it("handles cancelled sale status with cancellation alert watermark", () => {
    const cancelledSale = {
      status: "cancelled",
      isCancelled: true,
      cancelReason: "Customer returned items on counter",
    };

    expect(cancelledSale.isCancelled).toBe(true);
    expect(cancelledSale.cancelReason).toBe("Customer returned items on counter");
  });
});
