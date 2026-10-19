import { db, schema } from "@/server/db";
import { eq, and, sql, desc, or, gte, lte } from "drizzle-orm";

export interface ParsedStatementLine {
  date: string; // YYYY-MM-DD
  description: string;
  reference?: string;
  debit: number; // paise
  credit: number; // paise
  balance: number; // paise
}

export class BankReconciliationService {
  /**
   * Parse Indian bank CSV statement (HDFC, ICICI, SBI, Axis, or standard format)
   */
  static parseBankCSV(csvText: string): ParsedStatementLine[] {
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    // Find header line
    let headerIndex = -1;
    let headers: string[] = [];

    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      const lower = lines[i].toLowerCase();
      if (
        (lower.includes("date") || lower.includes("txn date")) &&
        (lower.includes("narration") || lower.includes("description") || lower.includes("particulars")) &&
        (lower.includes("debit") || lower.includes("withdrawal") || lower.includes("credit") || lower.includes("deposit"))
      ) {
        headerIndex = i;
        headers = lines[i].split(",").map((h) => h.replace(/["']/g, "").trim().toLowerCase());
        break;
      }
    }

    // Default to first line if no special header found
    if (headerIndex === -1) {
      headerIndex = 0;
      headers = lines[0].split(",").map((h) => h.replace(/["']/g, "").trim().toLowerCase());
    }

    const dateCol = headers.findIndex((h) => h.includes("date"));
    const descCol = headers.findIndex((h) => h.includes("narration") || h.includes("description") || h.includes("particulars"));
    const refCol = headers.findIndex((h) => h.includes("ref") || h.includes("chq") || h.includes("cheque") || h.includes("utr"));
    const debitCol = headers.findIndex((h) => h.includes("debit") || h.includes("withdrawal") || h.includes("dr"));
    const creditCol = headers.findIndex((h) => h.includes("credit") || h.includes("deposit") || h.includes("cr"));
    const balanceCol = headers.findIndex((h) => h.includes("balance") || h.includes("bal"));

    const parseMoneyPaise = (val: string | undefined): number => {
      if (!val) return 0;
      const clean = val.replace(/[^0-9.-]/g, "");
      const num = parseFloat(clean);
      return isNaN(num) ? 0 : Math.round(num * 100);
    };

    const parseDateStr = (raw: string | undefined): string => {
      if (!raw) return new Date().toISOString().split("T")[0];
      const clean = raw.replace(/["']/g, "").trim();

      // Support DD/MM/YYYY or DD-MM-YYYY
      const parts = clean.split(/[/\-.]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
        }
        if (parts[2].length === 4) {
          // DD-MM-YYYY
          return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
      }
      return new Date().toISOString().split("T")[0];
    };

    const parsedResults: ParsedStatementLine[] = [];

    for (let i = headerIndex + 1; i < lines.length; i++) {
      // Split preserving commas inside quotes if any
      const rawCols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(",");
      const cols = rawCols.map((c) => c.replace(/^["']|["']$/g, "").trim());

      const dateStr = parseDateStr(cols[dateCol]);
      const description = cols[descCol] || "Bank Transaction";
      const reference = refCol >= 0 ? cols[refCol] : undefined;
      const debit = debitCol >= 0 ? parseMoneyPaise(cols[debitCol]) : 0;
      const credit = creditCol >= 0 ? parseMoneyPaise(cols[creditCol]) : 0;
      const balance = balanceCol >= 0 ? parseMoneyPaise(cols[balanceCol]) : 0;

      if (debit > 0 || credit > 0) {
        parsedResults.push({
          date: dateStr,
          description,
          reference: reference && reference !== "-" ? reference : undefined,
          debit,
          credit,
          balance,
        });
      }
    }

    return parsedResults;
  }

  /**
   * Run auto-matching algorithms between bank statement lines and system payments
   */
  static async autoMatchStatement(statementId: string, tenantId: string) {
    const lines = await db
      .select()
      .from(schema.bankStatementLines)
      .where(
        and(
          eq(schema.bankStatementLines.statementId, statementId),
          eq(schema.bankStatementLines.matchStatus, "unmatched")
        )
      );

    // Fetch existing unmatched payments for this tenant
    const systemPayments = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.tenantId, tenantId))
      .orderBy(desc(schema.payments.paymentDate));

    let matchCount = 0;

    for (const line of lines) {
      const isCredit = (line.credit ?? 0) > 0;
      const targetAmount = isCredit ? (line.credit ?? 0) : (line.debit ?? 0);
      const expectedDirection = isCredit ? "in" : "out";

      // 1. Check exact reference match (UTR / Cheque No)
      if (line.reference && line.reference.length >= 4) {
        const refMatch = systemPayments.find(
          (p) =>
            p.reference &&
            (p.reference.includes(line.reference!) || line.reference!.includes(p.reference)) &&
            (p.amount ?? 0) === targetAmount
        );

        if (refMatch) {
          await db
            .update(schema.bankStatementLines)
            .set({
              matchedPaymentId: refMatch.id,
              matchStatus: "auto_matched",
            })
            .where(eq(schema.bankStatementLines.id, line.id));
          matchCount++;
          continue;
        }
      }

      // 2. Check exact amount + date proximity (+/- 3 days)
      const lineDate = new Date(line.transactionDate).getTime();
      const amountCandidate = systemPayments.find((p) => {
        if (p.direction !== expectedDirection) return false;
        if ((p.amount ?? 0) !== targetAmount) return false;

        const pDate = new Date(p.paymentDate).getTime();
        const diffDays = Math.abs(lineDate - pDate) / (1000 * 60 * 60 * 24);
        return diffDays <= 4;
      });

      if (amountCandidate) {
        await db
          .update(schema.bankStatementLines)
          .set({
            matchedPaymentId: amountCandidate.id,
            matchStatus: "auto_matched",
          })
          .where(eq(schema.bankStatementLines.id, line.id));
        matchCount++;
      }
    }

    return { matched: matchCount, total: lines.length };
  }
}
