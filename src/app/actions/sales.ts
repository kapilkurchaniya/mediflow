"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, gt, ilike, or } from "drizzle-orm";
import { getCurrentSession } from "@/server/auth";
import { recordStockMovement } from "@/server/domain/stock";
import { revalidatePath } from "next/cache";
import { sendWhatsAppReceipt } from "@/server/whatsapp";

export async function getSales() {
  const { session } = await getCurrentSession();
  if (!session?.tenantId || !session?.storeId) throw new Error("Unauthorized");

  return db
    .select({
      sale: schema.sales,
      customer: schema.customers,
    })
    .from(schema.sales)
    .leftJoin(schema.customers, eq(schema.sales.customerId, schema.customers.id))
    .where(
      and(
        eq(schema.sales.tenantId, session.tenantId),
        eq(schema.sales.storeId, session.storeId)
      )
    )
    .orderBy(desc(schema.sales.createdAt));
}

// POS Search: Returns medicines with their nearest expiry batches that have stock
export async function searchPosItems(query: string) {
  const { session } = await getCurrentSession();
  if (!session?.tenantId || !session?.storeId) throw new Error("Unauthorized");
  
  if (!query || query.length < 2) return [];

  const lowerQuery = query.toLowerCase();

  // Find medicines matching query
  const medicines = await db
    .select()
    .from(schema.medicines)
    .where(
      and(
        eq(schema.medicines.tenantId, session.tenantId),
        eq(schema.medicines.isActive, true),
        or(
          ilike(schema.medicines.name, `%${lowerQuery}%`),
          ilike(schema.medicines.barcode, `%${lowerQuery}%`)
        )
      )
    )
    .limit(20);

  if (medicines.length === 0) return [];

  const medicineIds = medicines.map((m) => m.id);

  // Get active batches for these medicines, ordered by expiry (nearest first)
  const batches = await db
    .select()
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.storeId, session.storeId),
        gt(schema.batches.qtyOnHand, 0)
      )
    )
    .orderBy(schema.batches.expiryDate);

  // Group batches by medicine
  const results = medicines.map((med) => {
    const medBatches = batches.filter((b) => b.medicineId === med.id);
    return {
      medicine: med,
      batches: medBatches,
    };
  }).filter((res) => res.batches.length > 0); // Only return if they have stock

  return results;
}

export type PosItemInput = {
  medicineId: string;
  batchId: string;
  qty: number;
  rate: number; // paise
  discountBp: number; // basis points
};

export async function createSaleInvoice(
  customerId: string | undefined,
  doctorName: string,
  items: PosItemInput[],
  paymentMethod: string,
  amountPaid: number // paise
) {
  const { session, user } = await getCurrentSession();
  if (!session?.tenantId || !session?.storeId || !user) {
    throw new Error("Unauthorized");
  }

  if (items.length === 0) return { error: "No items to bill" };

  try {
    let customerPhone = "";
    if (customerId) {
      const [customer] = await db
        .select({ phone: schema.customers.phone })
        .from(schema.customers)
        .where(eq(schema.customers.id, customerId));
      if (customer?.phone) customerPhone = customer.phone;
    }

    let generatedInvoiceNo = "";
    let finalTotalAmount = 0;

    const saleId = await db.transaction(async (tx) => {
      // 1. Fetch full details of batches and medicines to prevent client tampering
      const batchIds = items.map((i) => i.batchId);
      const dbBatches = await tx
        .select({
          batch: schema.batches,
          medicine: schema.medicines,
        })
        .from(schema.batches)
        .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
        .where(
          and(
            eq(schema.batches.storeId, session.storeId!),
            // Workaround for whereIn
            sql`${schema.batches.id} = ANY(ARRAY[${sql.join(batchIds, sql`, `)}]::uuid[])`
          )
        );

      let grossAmount = 0;
      let totalTaxAmount = 0;
      let totalDiscountAmount = 0;

      const processedItems = items.map((item) => {
        const dbRecord = dbBatches.find((b) => b.batch.id === item.batchId);
        if (!dbRecord) throw new Error(`Batch ${item.batchId} not found`);

        const { batch, medicine } = dbRecord;

        if (batch.qtyOnHand < item.qty) {
          throw new Error(`Insufficient stock for ${medicine.name}. Available: ${batch.qtyOnHand}`);
        }

        const itemGross = item.qty * item.rate;
        const discountAmount = Math.round((itemGross * item.discountBp) / 10000);
        const taxableAmount = itemGross - discountAmount;
        
        // Reverse calculate tax based on inclusive MRP/Sale Rate (common in retail)
        // If the rate is 100 and GST is 12%, taxable is 100 / 1.12
        // Assuming the passed rate is INCUSIVE of tax for retail POS:
        const gstRateMultiplier = 1 + (medicine.gstRateBp / 10000);
        const actualTaxable = Math.round(taxableAmount / gstRateMultiplier);
        const taxAmount = taxableAmount - actualTaxable;

        grossAmount += itemGross;
        totalDiscountAmount += discountAmount;
        totalTaxAmount += taxAmount;

        return {
          ...item,
          medicine,
          batch,
          discountAmount,
          taxableAmount: actualTaxable,
          taxAmount,
          totalAmount: taxableAmount,
        };
      });

      const totalInvoiceAmount = grossAmount - totalDiscountAmount; // Since rate is inclusive
      const amountDue = totalInvoiceAmount - amountPaid;

      // 2. Generate Invoice Number
      const invoiceNo = `INV-${Date.now().toString().slice(-6)}`;
      generatedInvoiceNo = invoiceNo;
      finalTotalAmount = totalInvoiceAmount;

      // 3. Create Sale Header
      const [sale] = await tx.insert(schema.sales).values({
        tenantId: session.tenantId,
        storeId: session.storeId,
        invoiceNo,
        customerId: customerId || null,
        doctorName: doctorName || null,
        grossAmount,
        discountAmount: totalDiscountAmount,
        taxableAmount: grossAmount - totalDiscountAmount - totalTaxAmount,
        cgst: totalTaxAmount / 2,
        sgst: totalTaxAmount / 2,
        igst: 0,
        totalAmount: totalInvoiceAmount,
        paidAmount: amountPaid,
        creditAmount: amountDue,
        status: "completed",
        completedAt: new Date(),
        createdBy: user.id,
      }).returning({ id: schema.sales.id });

      // 4. Process Items & Update Stock
      for (const item of processedItems) {
        // Decrement physical stock
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

        // Record Sale Item
        await tx.insert(schema.saleItems).values({
          tenantId: session.tenantId,
          saleId: sale.id,
          medicineId: item.medicineId,
          batchId: item.batchId,
          medicineName: item.medicine.name,
          batchNo: item.batch.batchNo,
          expiryDate: item.batch.expiryDate,
          qty: item.qty,
          mrp: item.batch.mrp,
          rate: item.rate, // inclusive rate
          discountBp: item.discountBp,
          discountAmount: item.discountAmount,
          taxableAmount: item.taxableAmount,
          gstRateBp: item.medicine.gstRateBp,
          cgst: item.taxAmount / 2,
          sgst: item.taxAmount / 2,
          igst: 0,
          totalAmount: item.totalAmount,
          unitCost: item.batch.purchaseRate,
        });
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

      return sale.id;
    });

    revalidatePath("/dashboard/sales");

    if (customerPhone) {
      await sendWhatsAppReceipt(customerPhone, generatedInvoiceNo, finalTotalAmount, "https://mediflow.demo/receipts/" + saleId);
    }

    return { success: true, saleId };
  } catch (err: any) {
    return { error: err.message || "Failed to create sale invoice" };
  }
}
