import { PageHeader } from "@/app/components/ui";
import { getBankStatements, getStatementLines, getCandidatePayments } from "@/app/actions/bank-reconciliation";
import { BankReconciliationClient } from "./BankReconciliationClient";
import { requirePagePermission } from "@/server/rbac";

export const metadata = {
  title: "Bank Reconciliation — MediFlow",
};

export default async function BankReconciliationPage() {
  await requirePagePermission("accounting.view");
  const statements = await getBankStatements();
  const selectedStatementId = statements[0]?.id;

  const [lines, candidatePayments] = await Promise.all([
    selectedStatementId ? getStatementLines(selectedStatementId) : Promise.resolve([]),
    getCandidatePayments(),
  ]);

  return (
    <div className="page space-y-6">
      <PageHeader
        backHref="/dashboard/accounting"
        title="Bank Statement Reconciliation"
        description="Auto-match electronic bank statement lines with pharmacy receipts, counter UPI settlements, and vendor RTGS payments."
      />

      <BankReconciliationClient
        initialStatements={statements}
        initialLines={lines}
        candidatePayments={candidatePayments}
      />
    </div>
  );
}
