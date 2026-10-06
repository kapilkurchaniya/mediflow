import { getTrialBalance, getJournalLines } from "@/app/actions/accounting";
import { BookOpenText, Scale, ArrowDownLeft, ArrowUpRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { PageHeader, StatCard, EmptyState } from "@/app/components/ui";
import { formatINR } from "@/lib/format";

export const metadata = { title: "Accounting" };

export default async function AccountingPage() {
  const trialBalance = await getTrialBalance();
  const journalLines = await getJournalLines();

  const totalDebit = trialBalance.reduce((sum, row) => sum + row.totalDebit, 0);
  const totalCredit = trialBalance.reduce((sum, row) => sum + row.totalCredit, 0);
  const balanced = totalDebit === totalCredit;

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Accounting"
        description="Double-entry trial balance and day book, posted automatically from sales and purchases."
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Total debits" value={formatINR(totalDebit)} icon={ArrowDownLeft} tone="info" />
        <StatCard label="Total credits" value={formatINR(totalCredit)} icon={ArrowUpRight} tone="neutral" />
        <StatCard
          label="Ledger status"
          value={balanced ? "Balanced" : "Out of balance"}
          icon={balanced ? CheckCircle2 : AlertTriangle}
          tone={balanced ? "brand" : "danger"}
          footnote={balanced ? "Debits equal credits" : `Difference ${formatINR(Math.abs(totalDebit - totalCredit))}`}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Trial balance */}
        <div className="card overflow-hidden xl:col-span-3 flex flex-col max-h-[640px]">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-ink-400" />
              <h2 className="card-title">Trial balance</h2>
            </div>
            <span className="text-[12.5px] text-ink-500">As of {format(new Date(), "d MMM yyyy")}</span>
          </div>

          {trialBalance.length === 0 ? (
            <EmptyState icon={Scale} title="No balances yet" description="Balances appear once the first sale or purchase is posted." compact />
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Account</th>
                    <th>Type</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {trialBalance.map((row) => (
                    <tr key={row.id}>
                      <td className="font-mono text-[12px] text-ink-500">{row.code}</td>
                      <td className="cell-primary">{row.name}</td>
                      <td>
                        <span className="badge badge-neutral capitalize">{row.type}</span>
                      </td>
                      <td className="text-right num text-ink-900">
                        {row.balance > 0 ? formatINR(Math.abs(row.balance)) : <span className="text-ink-300">—</span>}
                      </td>
                      <td className="text-right num text-ink-900">
                        {row.balance < 0 ? formatINR(Math.abs(row.balance)) : <span className="text-ink-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-ink-50">
                  <tr className="border-t-2 border-ink-200">
                    <td colSpan={3} className="px-4 py-3 text-[12px] font-semibold uppercase tracking-wide text-ink-600">
                      Total
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink-900 num">{formatINR(totalDebit)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink-900 num">{formatINR(totalCredit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Day book */}
        <div className="card overflow-hidden xl:col-span-2 flex flex-col max-h-[640px]">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <BookOpenText className="h-4 w-4 text-ink-400" />
              <h2 className="card-title">Day book</h2>
            </div>
            <span className="text-[12.5px] text-ink-500">Recent postings</span>
          </div>

          {journalLines.length === 0 ? (
            <EmptyState icon={BookOpenText} title="No journal entries" description="Entries post automatically when you bill or receive stock." compact />
          ) : (
            <ul className="flex-1 overflow-y-auto divide-y divide-ink-100">
              {journalLines.map(({ line, entry, account }) => {
                const isDebit = (line.debit ?? 0) > 0;
                return (
                  <li key={line.id} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-ink-50/70">
                    <span
                      className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded text-[10px] font-bold ${
                        isDebit ? "bg-sky-50 text-sky-700" : "bg-ink-100 text-ink-600"
                      }`}
                    >
                      {isDebit ? "Dr" : "Cr"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-[13px] font-medium text-ink-900">{account.name}</p>
                        <p className="shrink-0 text-[13px] font-medium text-ink-900 num">
                          {formatINR(isDebit ? line.debit : line.credit)}
                        </p>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-3 text-[12px] text-ink-500">
                        <p className="truncate" title={entry.narration}>
                          {entry.narration}
                        </p>
                        <p className="shrink-0 num">
                          <span className="font-mono">{entry.entryNo}</span> · {format(new Date(entry.entryDate), "d MMM")}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
