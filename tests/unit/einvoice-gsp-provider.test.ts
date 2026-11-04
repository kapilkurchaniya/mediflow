import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GspIRPProvider } from "@/server/domain/einvoice-providers/gsp-provider";
import type { EInvoicePayload } from "@/server/domain/einvoice-types";

describe("GspIRPProvider (Real NIC & GSP Integration)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockPayload: EInvoicePayload = {
    version: "1.1",
    transactionDetails: {
      taxScheme: "GST",
      supplyType: "B2B",
      reverseCharge: "N",
      igstOnIntra: "N",
    },
    documentDetails: {
      documentType: "INV",
      documentNumber: "INV-2026-001",
      documentDate: "04/11/2026",
    },
    sellerDetails: {
      gstin: "27GSPTE0985F1Z5",
      legalName: "MediFlow Pharmacy Pvt Ltd",
      address: "Commercial Center",
      location: "Mumbai",
      pincode: "400001",
      stateCode: "27",
    },
    buyerDetails: {
      gstin: "24AAACC1206D1ZM",
      legalName: "Healthcare Wholesalers",
      address: "Ring Road Hub",
      location: "Ahmedabad",
      pincode: "380001",
      stateCode: "24",
      placeOfSupply: "24",
    },
    itemList: [
      {
        slNo: 1,
        itemDescription: "Amoxicillin 500mg",
        hsnCode: "30041010",
        quantity: 10,
        unit: "BOX",
        unitPrice: 100,
        grossAmount: 1000,
        discount: 0,
        taxableAmount: 1000,
        gstRate: 12,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 120,
        totalItemValue: 1120,
        batchDetails: {
          batchNo: "AMX-99",
          expiryDate: "31/12/2027",
        },
      },
    ],
    valueDetails: {
      assValue: 1000,
      cgstValue: 0,
      sgstValue: 0,
      igstValue: 120,
      cessValue: 0,
      roundOff: 0,
      totalInvoiceValue: 1120,
    },
  };

  it("authenticates and caches GSP session token", async () => {
    const tokenRefreshedSpy = vi.fn();
    const provider = new GspIRPProvider({
      clientId: "test-client",
      clientSecret: "test-secret",
      portalUsername: "gstin_user",
      portalPassword: "gstin_password",
      isSandbox: true,
      onTokenRefreshed: tokenRefreshedSpy,
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/authenticate")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: "success",
              data: {
                authToken: "jwt_auth_token_xyz",
                expiresIn: 21600,
              },
            }),
        });
      }
      return Promise.reject(new Error("Unknown url " + url));
    });

    const token = await provider.getAuthToken();
    expect(token).toBe("jwt_auth_token_xyz");
    expect(tokenRefreshedSpy).toHaveBeenCalledWith("jwt_auth_token_xyz", expect.any(Date));

    // Calling again within validity window returns cached token without calling fetch again
    const token2 = await provider.getAuthToken();
    expect(token2).toBe("jwt_auth_token_xyz");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("generates IRN and extracts signed JWT QR code successfully", async () => {
    const provider = new GspIRPProvider({
      clientId: "test-client",
      clientSecret: "test-secret",
      portalUsername: "gstin_user",
      portalPassword: "gstin_password",
      isSandbox: true,
      cachedToken: "existing_valid_token",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      if (url.includes("/einvoice/generate")) {
        const body = JSON.parse(opts.body);
        expect(body.sellerDetails.gstin).toBe("27GSPTE0985F1Z5");
        expect(body.itemList[0].batchDetails.batchNo).toBe("AMX-99");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: "success",
              data: {
                Irn: "6D615F193AE5429E9EA3647BB9D41435E14DE6719FE851CBFF688E04CA2159BC",
                AckNo: "122612345678901",
                AckDt: "2026-11-04 21:50:00",
                SignedQRCode: "eyJhbGciOiJSUzI1NiJ9.signed_qr_payload.sample",
                SignedInvoice: "eyJhbGciOiJSUzI1NiJ9.signed_inv_payload.sample",
                Status: "ACT",
              },
            }),
        });
      }
      return Promise.reject(new Error("Unexpected endpoint: " + url));
    });

    const result = await provider.generateIRN(mockPayload);
    expect(result.irn).toBe("6D615F193AE5429E9EA3647BB9D41435E14DE6719FE851CBFF688E04CA2159BC");
    expect(result.ackNo).toBe("122612345678901");
    expect(result.signedQrCode).toBe("eyJhbGciOiJSUzI1NiJ9.signed_qr_payload.sample");
    expect(result.signedInvoice).toBe("eyJhbGciOiJSUzI1NiJ9.signed_inv_payload.sample");
    expect(result.status).toBe("ACT");
  });

  it("handles 401 expired token by re-authenticating and retrying", async () => {
    let callCount = 0;
    const provider = new GspIRPProvider({
      clientId: "test-client",
      clientSecret: "test-secret",
      portalUsername: "gstin_user",
      portalPassword: "gstin_password",
      isSandbox: true,
      cachedToken: "expired_token",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/einvoice/generate")) {
        callCount++;
        if (callCount === 1) {
          // Token expired error
          return Promise.resolve({
            ok: false,
            status: 401,
            text: () => Promise.resolve("Unauthorized - Token Expired"),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                Irn: "6D615F193AE5429E9EA3647BB9D41435E14DE6719FE851CBFF688E04CA2159BC",
                AckNo: "12269999",
                AckDt: "2026-11-04 21:55:00",
                SignedQRCode: "sample_qr",
                Status: "ACT",
              },
            }),
        });
      }
      if (url.includes("/authenticate")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: { authToken: "fresh_new_token", expiresIn: 3600 },
            }),
        });
      }
      return Promise.reject(new Error("Unexpected url " + url));
    });

    const result = await provider.generateIRN(mockPayload);
    expect(result.irn).toBe("6D615F193AE5429E9EA3647BB9D41435E14DE6719FE851CBFF688E04CA2159BC");
    expect(callCount).toBe(2);
  });

  it("cancels IRN via GSP with reason and remarks", async () => {
    const provider = new GspIRPProvider({
      clientId: "test-client",
      clientSecret: "test-secret",
      portalUsername: "gstin_user",
      portalPassword: "gstin_password",
      isSandbox: true,
      cachedToken: "token_123",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      if (url.includes("/einvoice/cancel")) {
        const body = JSON.parse(opts.body);
        expect(body.Irn).toBe("6D615F193AE5429E9EA3647BB9D41435E14DE6719FE851CBFF688E04CA2159BC");
        expect(body.CnlRsn).toBe("1");
        expect(body.CnlRem).toBe("Duplicate bill issued");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                Irn: body.Irn,
                CancelDate: "2026-11-04 22:00:00",
              },
            }),
        });
      }
      return Promise.reject(new Error("Unexpected url " + url));
    });

    const res = await provider.cancelIRN(
      "6D615F193AE5429E9EA3647BB9D41435E14DE6719FE851CBFF688E04CA2159BC",
      "1",
      "Duplicate bill issued"
    );
    expect(res.success).toBe(true);
    expect(res.cancelledDate).toBe("2026-11-04 22:00:00");
  });
});
