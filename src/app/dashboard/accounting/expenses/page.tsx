import Link from "next/link";
import {
  ReceiptText,
  Plus,
  Banknote,
  Building,
  TrendingUp,
  Receipt,
  Search,
} from "lucide-react";
import { db } from "@/server/db";
import { requirePagePermission, loadAuthCtx, can } from "@/server/rbac";
import { requireAuth } from "@/server/auth";
import {
  listExpenseAccounts,
  listExpensePayments,
  getExpenseSummaryStats,
} from "@/server/domain/expenses";
import { PageHeader, StatCard, EmptyState } from "@/app/components/ui";
import { DateRangeFilter } from "@/app/components/DateRangeFilter";
import { resolveDateRange } from "@/lib/date-range";
import { formatINR } from "@/lib/format";
import { ExpenseTable } from "./_components/ExpenseTable";

export const metadata = { title: "Operating Expenses | Accounting" };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    category?: string;
    method?: string;
    search?: string;
    page?: string;
  }>;
}) {
  await requirePagePermission("accounting.view");
  const { session, user } = await requireAuth();
  const ctx = await loadAuthCtx(db, session, user);

  const params = await searchParams;
  const canPost = can(ctx, "accounting.post");
  const canViewAllStores = can(ctx, "report.all_stores");

  const dateRange = resolveDateRange({
    range: params.range || "this_month",
    from: params.from,
    to: params.to,
  });

  const categories = await listExpenseAccounts(db, ctx.tenantId);

  const [stats, expensesData] = await Promise.all([
    getExpenseSummaryStats(db, ctx, {
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      canViewAllStores,
    }),
    listExpensePayments(db, ctx, {
      page: params.page ? parseInt(params.page, 10) : 1,
      pageSize: 25,
      search: params.search,
      expenseAccountId: params.category,
      method: params.method,
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      canViewAllStores,
    }),
  ]);

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Operating Expenses"
        description="Cash drawer payouts, rent, utilities, and daily store operational overheads."
        actions={
          canPost ? (
            <Link href="/dashboard/accounting/expenses/new" className="btn btn-primary text-[13px]">
              <Plus className="mr-1.5 h-4 w-4" /> Record Expense
            </Link>
          ) : undefined
        }
      />

      {/* Date Range Toolbar */}
      <div className="card p-2.5 sm:p-3 bg-white border border-ink-150 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter />
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Operating Expenses"
          value={formatINR(stats.totalExpenses)}
          icon={ReceiptText}
          tone="neutral"
          footnote={`${stats.voucherCount} vouchers posted`}
        />
        <StatCard
          label="Counter Till Payouts"
          value={formatINR(stats.cashPayouts)}
          icon={Banknote}
          tone="info"
          footnote="Deducted from POS register cash"
        />
        <StatCard
          label="Digital & Bank Payments"
          value={formatINR(stats.digitalPayments)}
          icon={Building}
          tone="brand"
          footnote="UPI, NEFT, RTGS & Cards"
        />
        <StatCard
          label="Top Expense Category"
          value={stats.topCategory?.name || "None"}
          icon={TrendingUp}
          tone="neutral"
          footnote={stats.topCategory ? formatINR(stats.topCategory.total) : "No expenses"}
        />
      </section>

      {/* Filters bar */}
      <div className="card p-4 bg-white shadow-sm border border-ink-150">
        <form method="get" className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="range" value={params.range || "this_month"} />
          {params.from && <input type="hidden" name="from" value={params.from} />}
          {params.to && <input type="hidden" name="to" value={params.to} />}

          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
            <input
              type="text"
              name="search"
              placeholder="Search payee, voucher # or notes..."
              defaultValue={params.search || ""}
              className="input pl-9 w-full text-[13px]"
            />
          </div>

          <select
            name="category"
            defaultValue={params.category || ""}
            className="select text-[13px] min-w-[180px]"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                [{c.code}] {c.name}
              </option>
            ))}
          </select>

          <select
            name="method"
            defaultValue={params.method || ""}
            className="select text-[13px] min-w-[130px]"
          >
            <option value="">All Methods</option>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="bank">Bank</option>
          </select>

          <button type="submit" className="btn btn-secondary text-[13px]">
            Filter
          </button>
        </form>
      </div>

      {expensesData.items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No expense vouchers found"
          description="Record operational expenses, rent or till cash payouts to view them here."
          action={
            canPost ? (
              <Link href="/dashboard/accounting/expenses/new" className="btn btn-primary btn-sm text-[13px]">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Record Expense
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ExpenseTable items={expensesData.items} />
      )}
    </div>
  );
}
