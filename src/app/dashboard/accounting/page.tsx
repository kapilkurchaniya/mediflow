import { getTrialBalance, getJournalLines } from "@/app/actions/accounting";
import {
  BookOpen,
  BookOpenText,
  Scale,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  TrendingUp,
  Landmark,
  Banknote,
  Users,
  ChevronRight,
  ArrowRight,
  ReceiptText,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, StatCard, EmptyState } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import { DateRangeFilter } from "@/app/components/DateRangeFilter";
import { resolveDateRange } from "@/lib/date-range";
import { requirePagePermission } from "@/server/rbac";

export const metadata = { title: "Accounting" };

const FINANCIAL_STATEMENTS = [
  {
    href: "/dashboard/accounting/day-book",
    title: "Day Book",
    desc: "Chronological posted journal register across all transactions",
    icon: BookOpen,
    tone: "text-blue-600 bg-blue-50 border-blue-200",
  },
  {
    href: "/dashboard/accounting/ledger",
    title: "Account Ledgers",
    desc: "Account-wise running balance statements & subledgers",
    icon: FileSpreadsheet,
    tone: "text-teal-600 bg-teal-50 border-teal-200",
  },
  {
    href: "/dashboard/accounting/trial-balance",
    title: "Trial Balance",
    desc: "Multi-column ledger movements & closing balances",
    icon: Scale,
    tone: "text-sky-600 bg-sky-50 border-sky-200",
  },
  {
    href: "/dashboard/accounting/profit-loss",
    title: "Profit & Loss",
    desc: "Revenue, cost of goods, and operational margin",
    icon: TrendingUp,
    tone: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  {
    href: "/dashboard/accounting/balance-sheet",
    title: "Balance Sheet",
    desc: "Assets, liabilities, and owners' equity statement",
    icon: Landmark,
    tone: "text-indigo-600 bg-indigo-50 border-indigo-200",
  },
  {
    href: "/dashboard/accounting/cash-flow",
    title: "Cash Flow",
    desc: "Counter cash, UPI receipts, and liquidity tracking",
    icon: Banknote,
    tone: "text-amber-600 bg-amber-50 border-amber-200",
  },
  {
    href: "/dashboard/accounting/receivables",
    title: "Receivables & Credit Control",
    desc: "Customer credit limits, ageing & debt collection",
    icon: Users,
    tone: "text-rose-600 bg-rose-50 border-rose-200",
  },
  {
    href: "/dashboard/accounting/expenses",
    title: "Operating Expenses",
    desc: "Vouchers, till payouts, rent, utilities & overheads",
    icon: ReceiptText,
    tone: "text-violet-600 bg-violet-50 border-violet-200",
  },
  {
    href: "/dashboard/accounting/periods",
    title: "Accounting Periods",
    desc: "Monthly period locks, closing snapshots & audit trail",
    icon: Lock,
    tone: "text-amber-700 bg-amber-50 border-amber-200",
  },
  {
    href: "/dashboard/accounting/vouchers",
    title: "Journal, Contra & Notes",
    desc: "Manual JV, cash ↔ bank contra, and standalone debit/credit notes",
    icon: BookOpenText,
    tone: "text-cyan-700 bg-cyan-50 border-cyan-200",
  },
  {
    href: "/dashboard/accounting/export",
    title: "CA Pack & Tally XML",
    desc: "GSTR-1 JSON, Tally Prime XML Masters/Vouchers, and registers",
    icon: FileSpreadsheet,
    tone: "text-indigo-700 bg-indigo-50 border-indigo-200",
  },
  {
    href: "/dashboard/accounting/pdc",
    title: "PDC Cheque Register",
    desc: "Post-dated cheques, pay-in-slips, clearance & dishonour",
    icon: Landmark,
    tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
];

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  await requirePagePermission("accounting.view");
  const params = await searchParams;
  const dateRange = resolveDateRange({
    range: params.range,
    from: params.from,
    to: params.to,
  });

  const [trialBalance, journalLines] = await Promise.all([
    getTrialBalance(dateRange.from, dateRange.to),
    getJournalLines(dateRange.from, dateRange.to),
  ]);

  const totalDebit = trialBalance.reduce((sum, row) => sum + row.totalDebit, 0);
  const totalCredit = trialBalance.reduce((sum, row) => sum + row.totalCredit, 0);
  const balanced = totalDebit === totalCredit;

  const periodLabel = dateRange.from && dateRange.to
    ? `${format(new Date(dateRange.from), "d MMM yyyy")} – ${format(new Date(dateRange.to), "d MMM yyyy")}`
    : `As of ${format(new Date(), "d MMM yyyy")}`;

  return (
    <div className="page space-y-6">
      <PageHeader
        eyebrow="Double-Entry Financials"
        title="Accounting & Day Book"
        description="Double-entry ledger, day book, and statutory statements posted automatically from POS and GRN."
        actions={
          <Link href="/dashboard/accounting/trial-balance" className="btn btn-primary">
            <FileSpreadsheet /> Full Trial Balance
          </Link>
        }
      />

      {/* Date Range Filter */}
      <div className="card px-4 py-3 bg-white/70 backdrop-blur-xs">
        <DateRangeFilter />
      </div>

      {/* Statement Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {FINANCIAL_STATEMENTS.map((stmt) => {
          const Icon = stmt.icon;
          return (
            <Link
              key={stmt.href}
              href={stmt.href}
              className="card card-interactive p-4 group flex flex-col justify-between"
            >
              <div>
                <div className={`h-9 w-9 rounded-lg border flex items-center justify-center mb-3 ${stmt.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-[14px] font-semibold text-ink-900 group-hover:text-brand-700 transition-colors">
                  {stmt.title}
                </h3>
                <p className="text-[12px] text-ink-500 mt-1 leading-snug">
                  {stmt.desc}
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1 text-[12px] font-medium text-brand-600 group-hover:translate-x-0.5 transition-transform">
                <span>Open statement</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          );
        })}
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Total Debits" value={formatINR(totalDebit)} icon={ArrowDownLeft} tone="info" />
        <StatCard label="Total Credits" value={formatINR(totalCredit)} icon={ArrowUpRight} tone="neutral" />
        <StatCard
          label="Ledger Status"
          value={balanced ? "Balanced" : "Out of Balance"}
          icon={balanced ? CheckCircle2 : AlertTriangle}
          tone={balanced ? "brand" : "danger"}
          footnote={balanced ? "Debits equal credits" : `Difference ${formatINR(Math.abs(totalDebit - totalCredit))}`}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Trial balance preview */}
        <div className="card overflow-hidden xl:col-span-3 flex flex-col max-h-[640px]">
          <div className="card-header border-b border-ink-150">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-ink-400" />
              <h2 className="card-title">Trial Balance Preview</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-ink-500">{periodLabel}</span>
              <Link href="/dashboard/accounting/trial-balance" className="btn btn-ghost btn-sm text-[12px]">
                Detailed <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </div>
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
              </table>
            </div>
          )}
        </div>

        {/* Day book */}
        <div className="card overflow-hidden xl:col-span-2 flex flex-col max-h-[640px]">
          <div className="card-header border-b border-ink-150">
            <div className="flex items-center gap-2">
              <BookOpenText className="h-4 w-4 text-ink-400" />
              <h2 className="card-title">Day Book (Journal)</h2>
            </div>
            <span className="text-[12px] text-ink-500">Recent 50 lines</span>
          </div>

          {journalLines.length === 0 ? (
            <EmptyState icon={BookOpenText} title="No journal entries" description="Vouchers appear here chronologically as sales and purchases occur." compact />
          ) : (
            <div className="flex-1 overflow-y-auto">
              <ul className="divide-y divide-ink-100">
                {journalLines.map(({ line, entry, account }) => (
                  <li key={line.id} className="p-3.5 hover:bg-ink-50/70 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-ink-500">
                          {entry.entryNo}
                        </span>
                        <span className="text-[11.5px] text-ink-400 num">
                          {format(new Date(entry.entryDate), "d MMM")}
                        </span>
                      </div>
                      <span className="num font-semibold text-[13px] text-ink-900">
                        {line.debit > 0 ? `Dr ${formatINR(line.debit)}` : `Cr ${formatINR(line.credit)}`}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[12.5px]">
                      <span className="text-ink-800 font-medium truncate max-w-[200px]">
                        {account.name}
                      </span>
                      <span className="text-[11.5px] text-ink-500 font-mono">
                        {account.code}
                      </span>
                    </div>
                    {entry.narration && (
                      <p className="mt-1 text-[11.5px] text-ink-400 truncate">
                        {entry.narration}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
