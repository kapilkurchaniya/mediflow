import {
  IndianRupee,
  PackageOpen,
  CalendarClock,
  ReceiptText,
  ScanLine,
  FileInput,
  Upload,
  UserPlus,
  ArrowUpRight,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { getDashboardStats } from "@/app/actions/dashboard";
import { getCurrentSession } from "@/server/auth";
import { PageHeader, StatCard, EmptyState, Avatar } from "@/app/components/ui";
import { formatINR, formatNumber } from "@/lib/format";
import { DateRangeFilter } from "@/app/components/DateRangeFilter";
import { resolveDateRange } from "@/lib/date-range";

export const metadata = { title: "Overview" };

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const QUICK_ACTIONS = [
  { href: "/dashboard/sales/pos", label: "New bill", desc: "Open the POS counter", icon: ScanLine, kbd: "F2" },
  { href: "/dashboard/purchases/new", label: "Record purchase", desc: "Post a supplier GRN", icon: FileInput },
  { href: "/dashboard/inventory/import", label: "Import stock", desc: "Upload a CSV / Excel export", icon: Upload },
  { href: "/dashboard/customers/new", label: "Add customer", desc: "Create a credit account", icon: UserPlus },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { range, from, to } = await searchParams;
  const dateRange = resolveDateRange({ range, from, to });
  const [stats, { user }] = await Promise.all([getDashboardStats(dateRange), getCurrentSession()]);
  const firstName = user?.name?.split(" ")[0] ?? "there";
  const avgBill = stats.todayCount > 0 ? Math.round(stats.todaySales / stats.todayCount) : 0;
  const attention = stats.lowStockCount + stats.expiringSoonCount;
  const isFiltered = Boolean((range && range !== "today") || from || to);
  const revenueLabel = range === "today" || !isFiltered ? "Today’s revenue" : "Period revenue";

  return (
    <div className="page space-y-6">
      <PageHeader
        eyebrow={format(new Date(), "EEEE, d MMMM yyyy")}
        title={`${greeting()}, ${firstName}`}
        description="Here’s what’s happening at your store."
        actions={
          <>
            <Link href="/dashboard/purchases/new" className="btn btn-secondary">
              <FileInput /> Record purchase
            </Link>
            <Link href="/dashboard/sales/pos" className="btn btn-primary">
              <ScanLine /> New bill
            </Link>
          </>
        }
      />

      {/* Date Filter Bar */}
      <div className="card px-4 py-3 bg-white/70 backdrop-blur-xs">
        <DateRangeFilter />
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
        <StatCard
          label={revenueLabel}
          value={formatINR(stats.todaySales)}
          icon={IndianRupee}
          tone="brand"
          footnote={
            <span className="inline-flex items-center gap-1">
              <span className="font-medium text-ink-700 num">{formatNumber(stats.todayCount)}</span> {isFiltered ? "invoices in period" : "invoices raised"}
            </span>
          }
        />
        <StatCard
          label="Average bill value"
          value={formatINR(avgBill)}
          icon={ReceiptText}
          tone="info"
          footnote="Across all payment modes"
        />
        <StatCard
          label="Low-stock items"
          value={formatNumber(stats.lowStockCount)}
          icon={PackageOpen}
          tone={stats.lowStockCount > 0 ? "warning" : "neutral"}
          href="/dashboard/inventory/batches"
          footnote={
            <span className="inline-flex items-center gap-1 group-hover:text-ink-700">
              At or below reorder level <ArrowUpRight className="h-3 w-3" />
            </span>
          }
        />
        <StatCard
          label="Expiring ≤ 90 days"
          value={formatNumber(stats.expiringSoonCount)}
          icon={CalendarClock}
          tone={stats.expiringSoonCount > 0 ? "danger" : "neutral"}
          href="/dashboard/inventory/batches?nearExpiry=true"
          footnote={
            <span className="inline-flex items-center gap-1 group-hover:text-ink-700">
              Batches with stock on hand <ArrowUpRight className="h-3 w-3" />
            </span>
          }
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Recent sales */}
        <div className="card xl:col-span-2 overflow-hidden">
          <div className="card-header">
            <div>
              <h2 className="card-title">Recent invoices</h2>
              <p className="text-[12.5px] text-ink-500">Latest 5 bills from this store</p>
            </div>
            <Link href="/dashboard/sales" className="btn btn-ghost btn-sm">
              View all <ChevronRight />
            </Link>
          </div>

          {stats.recentSales.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Time</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentSales.map((sale) => {
                    const name = sale.customerName || "Walk-in customer";
                    return (
                      <tr key={sale.id}>
                        <td>
                          <span className="font-mono text-[12.5px] font-medium text-ink-900">{sale.invoiceNo}</span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={name} size="sm" />
                            <span className="text-ink-800">{name}</span>
                          </div>
                        </td>
                        <td className="text-ink-500 num">{format(new Date(sale.createdAt), "d MMM, hh:mm a")}</td>
                        <td className="text-right font-medium text-ink-900 num">{formatINR(sale.totalAmount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={ReceiptText}
              title="No invoices yet"
              description="Bills you raise from the POS counter will appear here in real time."
              action={
                <Link href="/dashboard/sales/pos" className="btn btn-primary btn-sm">
                  <ScanLine /> Raise first bill
                </Link>
              }
            />
          )}
        </div>

        <div className="space-y-6">
          {/* Attention */}
          <div className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">Needs attention</h2>
              {attention > 0 ? (
                <span className="badge badge-warning num">{attention} open</span>
              ) : (
                <span className="badge badge-success badge-dot">All clear</span>
              )}
            </div>
            <ul className="divide-y divide-ink-100">
              <li>
                <Link
                  href="/dashboard/inventory/batches"
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-ink-50/70"
                >
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="flex-1 text-[13px] text-ink-700">Items below reorder level</span>
                  <span className="text-[13px] font-semibold text-ink-900 num">{stats.lowStockCount}</span>
                  <ChevronRight className="h-4 w-4 text-ink-300" />
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/inventory/batches?nearExpiry=true"
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-ink-50/70"
                >
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="flex-1 text-[13px] text-ink-700">Batches expiring in 90 days</span>
                  <span className="text-[13px] font-semibold text-ink-900 num">{stats.expiringSoonCount}</span>
                  <ChevronRight className="h-4 w-4 text-ink-300" />
                </Link>
              </li>
            </ul>
          </div>

          {/* Quick actions */}
          <div className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">Quick actions</h2>
            </div>
            <ul className="p-2">
              {QUICK_ACTIONS.map(({ href, label, desc, icon: Icon, kbd }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-ink-50"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-md border border-ink-150 bg-white text-ink-500 shadow-xs transition-colors group-hover:border-brand-200 group-hover:text-brand-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-ink-900">{label}</span>
                      <span className="block text-[12px] text-ink-500">{desc}</span>
                    </span>
                    {kbd ? (
                      <span className="kbd">{kbd}</span>
                    ) : (
                      <ChevronRight className="h-4 w-4 text-ink-300 transition-transform group-hover:translate-x-0.5" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
