import React from "react";
import Link from "next/link";
import { PageHeader } from "@/app/components/ui";
import {
  TrendingUp,
  Boxes,
  CalendarClock,
  Scale,
  Users,
  Truck,
  ArrowRight,
  BarChart3,
  Receipt,
  FileInput,
} from "lucide-react";

export const metadata = {
  title: "Reports & Business Intelligence | MediFlow",
  description: "Pharmacy operational analytics, inventory movement, expiry exposure, sales trends, and financial reports.",
};

const REPORT_CATEGORIES = [
  {
    category: "Multi-Store & Chain Intelligence",
    desc: "Consolidated performance, store ranking, gross margins, and cross-branch inventory health.",
    reports: [
      {
        href: "/dashboard/reports/chain",
        title: "Chain Overview & Branch Performance",
        desc: "Consolidated revenue, store ranking, margin comparisons, and near-expiry exposure.",
        icon: BarChart3,
        badge: "Chain Owner",
      },
    ],
  },
  {
    category: "Financial Statements",
    desc: "Statutory statements posted automatically via double-entry principles.",
    reports: [
      {
        href: "/dashboard/accounting/trial-balance",
        title: "Trial Balance",
        desc: "Period debits, credits, and closing balances for all ledger accounts.",
        icon: Scale,
        badge: "Statutory",
      },
      {
        href: "/dashboard/accounting/profit-loss",
        title: "Profit & Loss Statement",
        desc: "Revenue from operations, COGS, gross margin, and net operational profit.",
        icon: TrendingUp,
        badge: "Financial",
      },
      {
        href: "/dashboard/accounting/balance-sheet",
        title: "Balance Sheet",
        desc: "Assets, liabilities, and owners' equity statement of financial position.",
        icon: Scale,
        badge: "Financial",
      },
      {
        href: "/dashboard/accounting/cash-flow",
        title: "Cash Flow Statement",
        desc: "Direct method cash and digital payments operating liquidity analysis.",
        icon: BarChart3,
        badge: "Cash",
      },
    ],
  },
  {
    category: "Inventory & Stock Intelligence",
    desc: "Batch-level movement tracking, expiry risk mitigation, and dead stock discovery.",
    reports: [
      {
        href: "/dashboard/reports/inventory",
        title: "Fast & Slow Movers (Movement Analytics)",
        desc: "Identify top-selling medicines, sluggish stock, and non-moving dead inventory.",
        icon: Boxes,
        badge: "Inventory",
      },
      {
        href: "/dashboard/reports/expiry",
        title: "Expiry Exposure & Loss Risk",
        desc: "Audit batches expired and near-expiry in 30, 60, and 90-day warning buckets.",
        icon: CalendarClock,
        badge: "Risk",
      },
      {
        href: "/dashboard/inventory/batches",
        title: "Batches & Valuation Ledger",
        desc: "Batch-level stock on hand with purchase PTR landed valuation.",
        icon: Boxes,
        badge: "Stock",
      },
    ],
  },
  {
    category: "Credit & Operational Ledgers",
    desc: "Customer credit collection tracking and supplier payment commitments.",
    reports: [
      {
        href: "/dashboard/accounting/outstanding?type=receivable",
        title: "Customer Credit & Debtor Ageing",
        desc: "Customer credit balances aged into 0–30, 31–60, 61–90, and 90+ day buckets.",
        icon: Users,
        badge: "Credit",
      },
      {
        href: "/dashboard/accounting/outstanding?type=payable",
        title: "Supplier Payables & Creditors",
        desc: "Inward GRN purchase dues and payment scheduling for medicine distributors.",
        icon: Truck,
        badge: "Payables",
      },
      {
        href: "/dashboard/compliance",
        title: "Statutory Controlled Drug Registers",
        desc: "Official Form 35 Schedule H1, Schedule H, and Narcotics dispensing audit trail.",
        icon: Receipt,
        badge: "Compliance",
      },
    ],
  },
];

export default function ReportsHubPage() {
  return (
    <div className="page space-y-8">
      <PageHeader
        eyebrow="Business Intelligence"
        title="Reports & Analytics Hub"
        description="Comprehensive audit trails, statutory reports, and inventory intelligence for your pharmacy."
      />

      <div className="space-y-8">
        {REPORT_CATEGORIES.map((section) => (
          <div key={section.category} className="space-y-4">
            <div className="border-b border-ink-200 pb-2">
              <h2 className="text-[16px] font-semibold text-ink-900">{section.category}</h2>
              <p className="text-[12.5px] text-ink-500">{section.desc}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.reports.map((report) => {
                const Icon = report.icon;
                return (
                  <Link
                    key={report.href}
                    href={report.href}
                    className="card card-interactive p-5 group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="h-9 w-9 rounded-lg bg-ink-50 border border-ink-150 flex items-center justify-center text-ink-700 group-hover:text-brand-600 group-hover:border-brand-200 transition-colors">
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className="badge badge-neutral capitalize text-[11px]">
                          {report.badge}
                        </span>
                      </div>
                      <h3 className="text-[14.5px] font-semibold text-ink-900 group-hover:text-brand-700 transition-colors">
                        {report.title}
                      </h3>
                      <p className="text-[12.5px] text-ink-500 mt-1 leading-snug">
                        {report.desc}
                      </p>
                    </div>

                    <div className="mt-5 pt-3 border-t border-ink-100 flex items-center justify-between text-[12px] font-medium text-brand-600">
                      <span>View report</span>
                      <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
