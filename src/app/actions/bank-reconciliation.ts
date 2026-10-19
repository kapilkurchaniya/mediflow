"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { revalidatePath } from "next/cache";
import { BankReconciliationService } from "@/server/domain/bank-reconciliation";

export async function getBankStatements() {
  const { session } = await requireAuth();

  return db
    .select()
    .from(schema.bankStatements)
    .where(eq(schema.bankStatements.tenantId, session.tenantId))
    .orderBy(desc(schema.bankStatements.createdAt));
}

export async function getStatementLines(statementId: string) {
  const { session } = await requireAuth();

  const lines = await db
    .select({
      line: schema.bankStatementLines,
      payment: schema.payments,
    })
    .from(schema.bankStatementLines)
    .leftJoin(schema.payments, eq(schema.bankStatementLines.matchedPaymentId, schema.payments.id))
    .where(
      and(
        eq(schema.bankStatementLines.statementId, statementId),
        eq(schema.bankStatementLines.tenantId, session.tenantId)
      )
    )
    .orderBy(desc(schema.bankStatementLines.transactionDate));

  return lines;
}

export async function uploadBankStatement(formData: FormData) {
  const { session } = await requireAuth();

  const bankName = (formData.get("bankName") as string) || "HDFC Bank";
  const accountNo = (formData.get("accountNo") as string) || "50200012345678";
  const statementDate = (formData.get("statementDate") as string) || new Date().toISOString().split("T")[0];
  const csvContent = formData.get("csvContent") as string;
  const fileName = (formData.get("fileName") as string) || "statement.csv";

  if (!csvContent?.trim()) {
    return { error: "CSV content or file is empty" };
  }

  try {
    const parsedLines = BankReconciliationService.parseBankCSV(csvContent);

    if (parsedLines.length === 0) {
      return { error: "Could not detect any valid bank transactions in the provided CSV." };
    }

    // 1. Create statement
    const [statement] = await db
      .insert(schema.bankStatements)
      .values({
        tenantId: session.tenantId,
        storeId: session.storeId || null,
        bankName: bankName.trim(),
        accountNo: accountNo.trim(),
        statementDate,
        uploadFileName: fileName,
        status: "completed",
      })
      .returning();

    // 2. Insert lines
    for (const line of parsedLines) {
      await db.insert(schema.bankStatementLines).values({
        tenantId: session.tenantId,
        statementId: statement.id,
        transactionDate: line.date,
        description: line.description,
        reference: line.reference || null,
        debit: line.debit,
        credit: line.credit,
        balance: line.balance,
        matchStatus: "unmatched",
      });
    }

    // 3. Run auto reconciliation immediately
    const autoMatchResult = await BankReconciliationService.autoMatchStatement(statement.id, session.tenantId);

    revalidatePath("/dashboard/accounting/bank-reconciliation");
    return {
      success: true,
      statementId: statement.id,
      importedCount: parsedLines.length,
      autoMatchedCount: autoMatchResult.matched,
    };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to process bank statement" };
  }
}

export async function runAutoMatch(statementId: string) {
  const { session } = await requireAuth();

  try {
    const res = await BankReconciliationService.autoMatchStatement(statementId, session.tenantId);
    revalidatePath("/dashboard/accounting/bank-reconciliation");
    return { success: true, ...res };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Auto match failed" };
  }
}

export async function manualMatchLine(lineId: string, paymentId: string) {
  const { session } = await requireAuth();

  try {
    await db
      .update(schema.bankStatementLines)
      .set({
        matchedPaymentId: paymentId,
        matchStatus: "manual_matched",
      })
      .where(
        and(
          eq(schema.bankStatementLines.id, lineId),
          eq(schema.bankStatementLines.tenantId, session.tenantId)
        )
      );

    revalidatePath("/dashboard/accounting/bank-reconciliation");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to match transaction" };
  }
}

export async function unmatchLine(lineId: string) {
  const { session } = await requireAuth();

  try {
    await db
      .update(schema.bankStatementLines)
      .set({
        matchedPaymentId: null,
        matchStatus: "unmatched",
      })
      .where(
        and(
          eq(schema.bankStatementLines.id, lineId),
          eq(schema.bankStatementLines.tenantId, session.tenantId)
        )
      );

    revalidatePath("/dashboard/accounting/bank-reconciliation");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to unmatch" };
  }
}

export async function getCandidatePayments() {
  const { session } = await requireAuth();

  return db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.tenantId, session.tenantId))
    .orderBy(desc(schema.payments.paymentDate))
    .limit(50);
}
