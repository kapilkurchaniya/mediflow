"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, gt, gte, lte, ilike, or, sql, inArray } from "drizzle-orm";
import { getCurrentSession, requireAuth } from "@/server/auth";
import { recordStockMovement } from "@/server/domain/stock";
import { nextDocNumber } from "@/server/domain/sequence";
import { revalidatePath } from "next/cache";
import { sendWhatsAppReceipt } from "@/server/whatsapp";
import { computeSaleTotals, type SaleLineInput } from "@/lib/money";
import { format } from "date-fns";
import { postSaleJournalEntry } from "@/server/domain/accounting";
import {
  validateDispensingCompliance,
  recordDispensingLog,
  isScheduledDrug,
} from "@/server/domain/compliance";
import { createGstDocumentFromSale } from "@/server/domain/gst";
import { LoyaltyService } from "@/server/domain/loyalty";

export async function getSales(dateFrom?: string | null, dateTo?: string | null) {
  const { session, user } = await requireAuth();

  const conditions = [
    eq(schema.sales.tenantId, session.tenantId),
    eq(schema.sales.storeId, session.storeId),
  ];

  // Apply date filters if provided
  if (dateFrom) {
    conditions.push(gte(schema.sales.createdAt, new Date(dateFrom + "T00:00:00")));
  }
  if (dateTo) {
    conditions.push(lte(schema.sales.createdAt, new Date(dateTo + "T23:59:59.999")));
  }

  return db
    .select({
      sale: schema.sales,
      customer: schema.customers,
    })
    .from(schema.sales)
    .leftJoin(schema.customers, eq(schema.sales.customerId, schema.customers.id))
    .where(and(...conditions))
    .orderBy(desc(schema.sales.createdAt));
}

// POS Search: Returns medicines with their nearest expiry batches that have stock
export async function searchPosItems(query: string) {
  const { session, user } = await requireAuth();
  
  if (!query || query.length < 2) return [];

  const lowerQuery = query.toLowerCase();
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Find medicines matching query (by name, barcode, or generic composition)
  const medicines = await db
    .select({
      medicine: schema.medicines,
      rackCode: schema.racks.code,
      rackName: schema.racks.name,
    })
    .from(schema.medicines)
    .leftJoin(schema.racks, eq(schema.medicines.rackId, schema.racks.id))
    .where(
      and(
        eq(schema.medicines.tenantId, session.tenantId),
        eq(schema.medicines.isActive, true),
        or(
          ilike(schema.medicines.name, `%${lowerQuery}%`),
          ilike(schema.medicines.barcode, `%${lowerQuery}%`),
          ilike(schema.medicines.genericName, `%${lowerQuery}%`)
        )
      )
    )
    .limit(25);

  if (medicines.length === 0) return [];

  const medicineIds = medicines.map((m) => m.medicine.id);

  // Get active batches for these medicines, ordered by expiry (nearest first)
  // Ensure we don't sell expired stock
  const batches = await db
    .select()
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.storeId, session.storeId),
        gt(schema.batches.qtyOnHand, 0),
        gt(schema.batches.expiryDate, todayStr),
        inArray(schema.batches.medicineId, medicineIds)
      )
    )
    .orderBy(schema.batches.expiryDate);

  // Group batches by medicine
  const results = medicines.map(({ medicine, rackCode, rackName }) => {
    const medBatches = batches.filter((b) => b.medicineId === medicine.id);
    return {
      medicine: {
        ...medicine,
        rackCode,
        rackName,
      },
      batches: medBatches,
    };
  }); // Keep all so cashiers can see if an item is out of stock and find substitutes

  return results;
}

// Find substitutes with identical generic composition in stock
export async function findSubstitutes(genericName: string, excludeMedicineId?: string) {
  const { session } = await requireAuth();
  if (!genericName || genericName.trim().length < 2) return [];

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const cleanGeneric = genericName.trim().toLowerCase();

  const conditions = [
    eq(schema.medicines.tenantId, session.tenantId),
    eq(schema.medicines.isActive, true),
    ilike(schema.medicines.genericName, `%${cleanGeneric}%`),
  ];
  if (excludeMedicineId) {
    conditions.push(sql`${schema.medicines.id} != ${excludeMedicineId}`);
  }

  const medicines = await db
    .select()
    .from(schema.medicines)
    .where(and(...conditions))
    .limit(10);

  if (medicines.length === 0) return [];
  const medicineIds = medicines.map((m) => m.id);

  const batches = await db
    .select()
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.storeId, session.storeId),
        gt(schema.batches.qtyOnHand, 0),
        gt(schema.batches.expiryDate, todayStr),
        inArray(schema.batches.medicineId, medicineIds)
      )
    )
    .orderBy(schema.batches.expiryDate);

  return medicines
    .map((med) => {
      const medBatches = batches.filter((b) => b.medicineId === med.id);
      return {
        medicine: med,
        batches: medBatches,
        totalStock: medBatches.reduce((acc, b) => acc + b.qtyOnHand, 0),
      };
    })
    .filter((res) => res.batches.length > 0);
}

export type PosItemInput = {
  medicineId: string;
  batchId: string;
  qty: number;
  rate: number; // paise - ignored by server, but we keep the type signature for now
  discountBp: number; // basis points
};

export type ComplianceDetailsInput = {
  doctorName?: string;
  doctorRegNo?: string;
  doctorAddress?: string;
  patientName?: string;
  patientAge?: number;
  patientGender?: string;
  patientAddress?: string;
  patientPhone?: string;
  prescriptionRef?: string;
  prescriptionDate?: string;
  prescriptionId?: string;
};

export async function createSaleInvoice(
  customerId: string | undefined,
  doctorName: string,
  items: PosItemInput[],
  paymentMethod: string,
  amountPaid: number, // paise
  complianceDetails?: ComplianceDetailsInput,
  medicalRepId?: string
) {
  const { session, user } = await requireAuth();

  if (items.length === 0) return { error: "No items to bill" };

  try {
    let customerPhone = "";
    let customerName = "";
    if (customerId?.trim()) {
      const [customer] = await db
        .select({
          phone: schema.customers.phone,
          name: schema.customers.name,
          age: schema.customers.age,
          gender: schema.customers.gender,
          address: schema.customers.address,
        })
        .from(schema.customers)
        .where(
          and(
            eq(schema.customers.id, customerId.trim()),
            eq(schema.customers.tenantId, session.tenantId) // Tenant isolation fix
          )
        );
      if (customer?.phone) customerPhone = customer.phone;
      if (customer?.name) customerName = customer.name;
    }

    const [store] = await db
      .select({ invoicePrefix: schema.stores.invoicePrefix })
      .from(schema.stores)
      .where(
        and(
          eq(schema.stores.id, session.storeId),
          eq(schema.stores.tenantId, session.tenantId)
        )
      );
      
    if (!store) throw new Error("Store not found");

    let generatedInvoiceNo = "";
    let finalTotalAmount = 0;

    const saleId = await db.transaction(async (tx) => {
      // 1. Fetch full details of batches and medicines to prevent client tampering
      const batchIds = items.map((i) => i.batchId);
      
      // We lock batches for update via recordStockMovement, but here we just need to read them to compute totals first
      const dbBatches = await tx
        .select({
          batch: schema.batches,
          medicine: schema.medicines,
        })
        .from(schema.batches)
        .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
        .where(
          and(
            eq(schema.batches.storeId, session.storeId),
            sql`${schema.batches.id} = ANY(ARRAY[${sql.join(batchIds, sql`, `)}]::uuid[])`
          )
        );

      const todayStr = format(new Date(), 'yyyy-MM-dd');
      
      const lineInputs: SaleLineInput[] = [];
      const processedItems = items.map((item) => {
        const dbRecord = dbBatches.find((b) => b.batch.id === item.batchId);
        if (!dbRecord) throw new Error(`Batch ${item.batchId} not found`);

        const { batch, medicine } = dbRecord;

        if (batch.qtyOnHand < item.qty) {
          throw new Error(`Insufficient stock for ${medicine.name}. Available: ${batch.qtyOnHand}`);
        }
        
        if (batch.expiryDate <= todayStr) {
          throw new Error(`Batch for ${medicine.name} has expired on ${batch.expiryDate}`);
        }
        
        // Use server-side rate, falling back to MRP
        const saleRate = batch.saleRate ?? batch.mrp ?? 0;

        lineInputs.push({
          qty: item.qty,
          rate: saleRate,
          discountBp: item.discountBp,
          gstRateBp: medicine.gstRateBp
        });

        return {
          ...item,
          medicine,
          batch,
          saleRate
        };
      });

      // 1.1 Drug Compliance Validation (Drugs & Cosmetics Act)
      const effectiveDoctorName = complianceDetails?.doctorName || doctorName;
      const effectivePatientName = complianceDetails?.patientName || customerName;

      const complianceCheck = validateDispensingCompliance({
        items: processedItems.map((p) => ({
          medicineName: p.medicine.name,
          schedule: p.medicine.schedule,
          rxRequired: p.medicine.rxRequired,
          qty: p.qty,
        })),
        doctorName: effectiveDoctorName,
        doctorRegNo: complianceDetails?.doctorRegNo,
        patientName: effectivePatientName,
        patientAddress: complianceDetails?.patientAddress,
        patientAge: complianceDetails?.patientAge,
        prescriptionRef: complianceDetails?.prescriptionRef,
      });

      if (!complianceCheck.valid) {
        throw new Error(complianceCheck.errors.join("; "));
      }

      // Compute GST-inclusive totals (replaces manual 5% math)
      const isInterState = false; // Could determine this based on customer vs store state code
      const totals = computeSaleTotals(lineInputs, isInterState);
      
      // Calculate amount due based on server-computed total
      const amountDue = totals.total - amountPaid;

      // 2. Generate Invoice Number (gap-free, row-locked)
      const invoiceNo = await nextDocNumber(tx, session.tenantId, session.storeId, "sale", store.invoicePrefix);
      generatedInvoiceNo = invoiceNo;
      finalTotalAmount = totals.total;

      // 3. Create Sale Header
      const [sale] = await tx.insert(schema.sales).values({
        tenantId: session.tenantId,
        storeId: session.storeId,
        invoiceNo,
        customerId: customerId?.trim() ? customerId.trim() : null,
        medicalRepId: medicalRepId?.trim() || null,
        doctorName: effectiveDoctorName?.trim() ? effectiveDoctorName.trim() : null,
        doctorRegNo: complianceDetails?.doctorRegNo?.trim() || null,
        doctorAddress: complianceDetails?.doctorAddress?.trim() || null,
        patientAge: complianceDetails?.patientAge ?? null,
        patientGender: complianceDetails?.patientGender || null,
        patientAddress: complianceDetails?.patientAddress?.trim() || null,
        prescriptionId: complianceDetails?.prescriptionId || null,
        prescriptionRef: complianceDetails?.prescriptionRef?.trim() || null,
        pharmacistId: user.id,
        grossAmount: totals.gross,
        discountAmount: totals.discount,
        taxableAmount: totals.taxable,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        roundOff: totals.roundOff,
        totalAmount: totals.total,
        paidAmount: amountPaid,
        creditAmount: amountDue > 0 ? amountDue : 0,
        status: "completed",
        completedAt: new Date(),
        createdBy: user.id,
      }).returning({ id: schema.sales.id });

      // 4. Process Items & Update Stock
      const saleItemsToInsert = [];
      for (let i = 0; i < processedItems.length; i++) {
        const item = processedItems[i];
        const lineRes = totals.lines[i];
        
        // Decrement physical stock (this locks the batch row)
        await recordStockMovement({
          tx,
          tenantId: session.tenantId,
          storeId: session.storeId,
          batchId: item.batchId,
          medicineId: item.medicineId,
          type: "sale",
          qtyChange: -item.qty, // Negative for sale
          unitCost: item.batch.purchaseRate,
          refType: "sale",
          refId: sale.id,
          userId: user.id,
        });

        saleItemsToInsert.push({
          tenantId: session.tenantId,
          saleId: sale.id,
          medicineId: item.medicineId,
          batchId: item.batchId,
          medicineName: item.medicine.name,
          batchNo: item.batch.batchNo,
          expiryDate: item.batch.expiryDate,
          qty: item.qty,
          mrp: item.batch.mrp,
          rate: item.saleRate, // server-side rate
          discountBp: item.discountBp,
          discountAmount: lineRes.discount,
          taxableAmount: lineRes.taxable,
          gstRateBp: item.medicine.gstRateBp,
          cgst: lineRes.cgst,
          sgst: lineRes.sgst,
          igst: lineRes.igst,
          totalAmount: lineRes.total,
          unitCost: item.batch.purchaseRate,
        });
      }

      let insertedItems: Array<{ id: string }> = [];
      if (saleItemsToInsert.length > 0) {
        insertedItems = await tx.insert(schema.saleItems).values(saleItemsToInsert).returning({ id: schema.saleItems.id });
      }

      // 4.1 Record Statutory Dispensing Register Entries for Controlled Drugs
      for (let i = 0; i < processedItems.length; i++) {
        const item = processedItems[i];
        const insertedSaleItem = insertedItems[i];
        if (isScheduledDrug(item.medicine.schedule) && insertedSaleItem) {
          await recordDispensingLog({
            tx,
            tenantId: session.tenantId,
            storeId: session.storeId,
            saleId: sale.id,
            saleItemId: insertedSaleItem.id,
            medicineId: item.medicineId,
            batchId: item.batchId,
            medicineName: item.medicine.name,
            batchNo: item.batch.batchNo,
            expiryDate: item.batch.expiryDate,
            manufacturerName: null,
            schedule: item.medicine.schedule,
            patientName: effectivePatientName || "Walk-in Patient",
            patientAge: complianceDetails?.patientAge ?? null,
            patientGender: complianceDetails?.patientGender || null,
            patientAddress: complianceDetails?.patientAddress || null,
            patientPhone: complianceDetails?.patientPhone || customerPhone || null,
            doctorName: effectiveDoctorName || "Registered Medical Practitioner",
            doctorRegNo: complianceDetails?.doctorRegNo || null,
            doctorAddress: complianceDetails?.doctorAddress || null,
            prescriptionRef: complianceDetails?.prescriptionRef || null,
            prescriptionDate: complianceDetails?.prescriptionDate || format(new Date(), "yyyy-MM-dd"),
            quantityDispensed: item.qty,
            pharmacistId: user.id,
            pharmacistName: user.name,
            pharmacistRegNo: (user as unknown as { pharmacistRegNo?: string }).pharmacistRegNo || null,
          });
        }
      }

      // 5. Record Payment
      if (amountPaid > 0) {
        await tx.insert(schema.salePayments).values({
          tenantId: session.tenantId,
          saleId: sale.id,
          method: paymentMethod,
          amount: amountPaid,
          status: "success",
        });
      }

      // 6. Post Double-Entry Journal Entry
      await postSaleJournalEntry({
        tx,
        tenantId: session.tenantId,
        storeId: session.storeId,
        userId: user.id,
        saleId: sale.id,
        invoiceNo,
        invoiceDate: new Date(),
        customerId: customerId?.trim() ? customerId.trim() : null,
        customerName: customerName || null,
        paymentMethod,
        taxableAmount: totals.taxable,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        roundOff: totals.roundOff,
        totalAmount: totals.total,
        paidAmount: amountPaid,
        creditAmount: amountDue > 0 ? amountDue : 0,
      });

      // 7. Record GST Document
      // Optional steps run in a SAVEPOINT (nested tx.transaction). A failed SQL statement poisons a
      // Postgres transaction: catching the JS error is not enough, COMMIT would silently become a
      // ROLLBACK and the bill would be reported as saved when it is not. The savepoint rolls back
      // only this step. TODO(B2.1): enqueue a retry in the outbox instead of just logging.
      try {
        await tx.transaction(async (sp) => {
          await createGstDocumentFromSale(sp, {
            saleId: sale.id,
            tenantId: session.tenantId,
            storeId: session.storeId,
          });
        });
      } catch (gstErr) {
        console.error("Warning: GST Document auto-creation failed; sale kept:", gstErr);
      }

      // 8. Earn Loyalty Points
      if (customerId?.trim()) {
        try {
          await tx.transaction(async (sp) => {
            await LoyaltyService.earnPoints(sp, {
              tenantId: session.tenantId,
              customerId: customerId.trim(),
              saleAmountPaise: finalTotalAmount,
              saleId: sale.id,
            });
          });
        } catch (loyaltyErr) {
          console.error("Warning: Loyalty points earning failed; sale kept:", loyaltyErr);
        }
      }

      return sale.id;
    });

    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/accounting");
    revalidatePath("/dashboard/gst");

    if (customerPhone) {
      // In a real app we'd queue this out of band, but keeping it simple
      await sendWhatsAppReceipt(customerPhone, generatedInvoiceNo, finalTotalAmount, "https://mediflow.demo/receipts/" + saleId);
    }

    return { success: true, saleId };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create sale invoice" };
  }
}

export async function getSaleById(id: string) {
  const { session } = await requireAuth();
  const [sale] = await db.select().from(schema.sales).where(and(eq(schema.sales.id, id), eq(schema.sales.tenantId, session.tenantId)));
  if (!sale) return null;
  const items = await db.select().from(schema.saleItems).where(eq(schema.saleItems.saleId, id));
  const [customer] = sale.customerId ? await db.select().from(schema.customers).where(eq(schema.customers.id, sale.customerId)) : [null];
  const [store] = await db.select().from(schema.stores).where(eq(schema.stores.id, sale.storeId));
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, sale.tenantId));
  return { sale, items, customer, store, tenant };
}
