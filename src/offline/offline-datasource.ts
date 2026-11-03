import type {
  PosDataSource,
  SearchResult,
  SubstituteItem,
  CustomerRow,
  DoctorRow,
  MedicalRepRow,
  HeldSaleItem,
} from "@/app/dashboard/sales/pos/_data/posData";
import type { PosDB } from "./db";
import { searchMedicines, searchCustomers, searchDoctors, getBatchAvailableStock } from "./search";
import { createOfflineSale } from "./offline-sale";
import type { PaymentMethod } from "./types";

export interface OfflinePosContext {
  tenantId: string;
  storeId: string;
  deviceId: string;
  cashierId: string;
}

export class OfflinePosDataSource implements PosDataSource {
  constructor(
    private readonly db: PosDB,
    private readonly ctx: OfflinePosContext,
  ) {}

  async searchItems(query: string): Promise<SearchResult[]> {
    const results = await searchMedicines(this.db, this.ctx.tenantId, this.ctx.storeId, query);
    return results.map((r) => ({
      medicine: {
        id: r.medicine.id,
        name: r.medicine.name,
        genericName: r.medicine.genericName,
        gstRateBp: 500,
        rxRequired: Boolean(r.medicine.schedule),
        schedule: r.medicine.schedule,
        rackCode: null,
        rackName: null,
        unitsPerPack: 1,
        packUnit: "strip",
        looseUnit: "tablet",
      },
      batches: r.batches.map((b) => ({
        id: b.batch.id,
        batchNo: b.batch.batchNumber,
        expiryDate: b.batch.expiryDate,
        qtyOnHand: b.availableQty,
        mrp: b.batch.mrpPaise / 100,
        saleRate: b.batch.saleRatePaise / 100,
      })),
    }));
  }

  async findSubstitutes(genericName: string): Promise<SubstituteItem[]> {
    if (!genericName.trim()) return [];
    const q = genericName.trim().toLowerCase();
    const allMeds = await this.db.medicines
      .where("tenantId")
      .equals(this.ctx.tenantId)
      .toArray();

    const matches = allMeds.filter(
      (m) => m.isActive && m.genericName && m.genericName.toLowerCase().includes(q),
    );

    const items: SubstituteItem[] = [];
    for (const med of matches) {
      const batches = await this.db.batches
        .where("[storeId+medicineId]")
        .equals([this.ctx.storeId, med.id])
        .toArray();

      const active = batches.filter((b) => b.isActive);
      const batchSummaries = [];
      let totalStock = 0;

      for (const b of active) {
        const stock = await getBatchAvailableStock(this.db, this.ctx.storeId, b.id);
        if (stock && stock.availableQty > 0) {
          batchSummaries.push({
            id: b.id,
            batchNo: b.batchNumber,
            expiryDate: b.expiryDate,
            qtyOnHand: stock.availableQty,
            mrp: b.mrpPaise / 100,
            saleRate: b.saleRatePaise / 100,
          });
          totalStock += stock.availableQty;
        }
      }

      if (batchSummaries.length > 0) {
        items.push({
          medicine: {
            id: med.id,
            name: med.name,
            genericName: med.genericName,
            gstRateBp: 500,
          },
          batches: batchSummaries,
          totalStock,
        });
      }
    }
    return items;
  }

  async getCustomers(query?: string): Promise<CustomerRow[]> {
    const list = await searchCustomers(this.db, this.ctx.tenantId, query || "");
    return list.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      loyaltyPoints: 0,
      creditLimit: c.creditLimitPaise / 100,
    }));
  }

  async createQuickCustomer(): Promise<{ customer?: CustomerRow; error?: string }> {
    return {
      error: "New customer creation is disabled while offline. Please select an existing customer or bill as Walk-in.",
    };
  }

  async getCustomerRedeemablePoints(): Promise<{ points: number; valuePaise: number }> {
    return { points: 0, valuePaise: 0 };
  }

  async getDoctors(query?: string): Promise<DoctorRow[]> {
    const list = await searchDoctors(this.db, this.ctx.tenantId, query || "");
    return list.map((d) => ({
      id: d.id,
      name: d.name,
      regNo: d.regNo || "REG-UNKNOWN",
      hospital: null,
    }));
  }

  async getMedicalReps(): Promise<MedicalRepRow[]> {
    return [];
  }

  async getShiftStatus() {
    return { activeShift: null, requireShift: false };
  }

  async holdSale(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: "Parking/holding bills is disabled while offline." };
  }

  async listHeldSales(): Promise<{ sales: HeldSaleItem[]; count: number }> {
    return { sales: [], count: 0 };
  }

  async resumeHeldSale(): Promise<{ success: false; error: string }> {
    return { success: false, error: "Resuming parked bills is disabled while offline." };
  }

  async discardHeldSale(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: "Discarding parked bills is disabled while offline." };
  }

  async createPromiseOrder(): Promise<{ success?: boolean; error?: string }> {
    return { error: "Promise orders are disabled while offline." };
  }

  async createSale(params: Parameters<PosDataSource["createSale"]>[0]) {
    // 1. Loyalty points redemption rejection
    if (params.redeemPoints && params.redeemPoints > 0) {
      return { error: "Loyalty points redemption is disabled while offline." };
    }

    // 2. Normalize payments and validate credit policy
    const payments = params.paymentsInput && params.paymentsInput.length > 0
      ? params.paymentsInput.map((p) => ({
          method: p.method as PaymentMethod,
          amountPaise: p.amount,
          reference: undefined,
        }))
      : [{
          method: (params.paymentMethod === "split" ? "cash" : params.paymentMethod) as PaymentMethod,
          amountPaise: Math.round(params.amountPaid * 100),
          reference: undefined,
        }];

    const creditPayment = payments.find((p) => p.method === "credit");
    if (creditPayment && creditPayment.amountPaise > 0) {
      if (!params.customerId) {
        return { error: "Customer selection required for credit sale." };
      }
      const customer = await this.db.customers.get(params.customerId);
      if (!customer) {
        return { error: "Customer not found in offline records for credit check." };
      }

      // Projected credit calculation: current credit + pending offline credit
      const pendingSales = await this.db.pendingSales
        .where("[storeId+status]")
        .anyOf([
          [this.ctx.storeId, "pending"],
          [this.ctx.storeId, "syncing"],
        ])
        .toArray();

      let pendingCreditPaise = 0;
      for (const s of pendingSales) {
        if (s.payload.customerId === params.customerId) {
          for (const p of s.payload.payments || []) {
            if (p.method === "credit") {
              pendingCreditPaise += p.amount;
            }
          }
        }
      }

      const projectedCredit = customer.currentCreditPaise + pendingCreditPaise + creditPayment.amountPaise;
      if (projectedCredit > customer.creditLimitPaise) {
        return {
          error: `Credit limit exceeded offline. Available: ₹${Math.max(
            0,
            (customer.creditLimitPaise - customer.currentCreditPaise - pendingCreditPaise) / 100,
          ).toFixed(2)}`,
        };
      }
    }

    try {
      // 3. Commit sale locally with consecutive invoice allocation and outbox enqueue
      const result = await createOfflineSale(this.db, {
        storeId: this.ctx.storeId,
        deviceId: this.ctx.deviceId,
        cashierId: this.ctx.cashierId,
        customerId: params.customerId,
        lines: params.items.map((it) => ({
          batchId: it.batchId || "",
          medicineId: it.medicineId,
          qty: it.qty,
          packQty: it.packQty,
          looseQty: it.looseQty,
          ratePaise: Math.round(it.rate * 100),
          discountBp: it.discountBp || 0,
          gstRateBp: 500,
        })),
        payments,
        compliance: params.complianceDetails ? {
          doctorName: params.complianceDetails.doctorName,
          doctorRegNo: params.complianceDetails.doctorRegNo,
          prescriptionRef: params.complianceDetails.prescriptionRef,
          prescriptionDate: params.complianceDetails.prescriptionDate,
          patientAge: params.complianceDetails.patientAge,
          patientGender: params.complianceDetails.patientGender,
        } : undefined,
        medicalRepId: params.medicalRepId,
      });

      return {
        saleId: result.clientSaleId,
        invoiceNo: result.invoiceNo,
        changeDue: 0,
      };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "Failed to record offline sale",
      };
    }
  }
}
