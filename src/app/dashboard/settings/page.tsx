import { PageHeader } from "@/app/components/ui";
import { getStoreSettings } from "@/app/actions/settings";
import { SettingsForm } from "./SettingsForm";
import {
  Receipt,
  ShieldCheck,
  Printer,
  CheckCircle2,
  User,
  Sliders,
} from "lucide-react";
import Link from "next/link";
import { requirePagePermission } from "@/server/rbac";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePagePermission("settings.manage");
  const data = await getStoreSettings();
  const { store, user, tenant } = data;

  return (
    <div className="page space-y-6">
      <PageHeader
        eyebrow="Configuration"
        title="Store & Billing Settings"
        description="Manage your pharmacy identity, drug licenses, GST details, and billing preferences."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Store Profile & Statutory Info Form */}
        <div className="lg:col-span-2 space-y-6">
          <SettingsForm store={store} />

          {/* Billing & Printing Preferences */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-ink-150">
              <Printer className="h-5 w-5 text-sky-600" />
              <div>
                <h2 className="text-[15px] font-semibold text-ink-900">
                  Billing & Thermal Printing
                </h2>
                <p className="text-[12px] text-ink-500">
                  Default format options for sales counter receipts.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
              <div className="p-3.5 rounded-lg border border-brand-200 bg-brand-50/30 flex items-start gap-3">
                <Receipt className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-ink-900">Thermal 80mm Roll (Default)</p>
                  <p className="text-[12px] text-ink-500 mt-0.5">
                    Fast ESC/POS counter receipt with medicine, batch, expiry, MRP & savings.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-lg border border-ink-150 bg-white flex items-start gap-3">
                <ShieldCheck className="h-4 w-4 text-ink-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-ink-900">A4 GST Tax Invoice</p>
                  <p className="text-[12px] text-ink-500 mt-0.5">
                    Full GST breakdown with HSN summary, CGST/SGST ledger, and doctor details.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2 text-[12.5px] text-ink-500">
              <p>
                💡 Thermal 80mm is automatically optimized for standard receipt printers (TVS, Epson, NGX).
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Account & Organization Details */}
        <div className="space-y-6">
          {/* User Account Card */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-ink-150">
              <User className="h-5 w-5 text-purple-600" />
              <div>
                <h3 className="text-[14px] font-semibold text-ink-900">Logged-in User</h3>
                <p className="text-[12px] text-ink-500">Active counter session</p>
              </div>
            </div>

            <div className="space-y-3 text-[13px]">
              <div>
                <span className="text-ink-400 text-[11.5px] uppercase font-mono block">Operator Name</span>
                <span className="font-medium text-ink-900">{user.name}</span>
              </div>
              <div>
                <span className="text-ink-400 text-[11.5px] uppercase font-mono block">Email Address</span>
                <span className="font-mono text-ink-700">{user.email}</span>
              </div>
              {user.phone && (
                <div>
                  <span className="text-ink-400 text-[11.5px] uppercase font-mono block">Phone</span>
                  <span className="font-mono text-ink-700">{user.phone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Organization & Subscription */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-ink-150">
              <Sliders className="h-5 w-5 text-emerald-600" />
              <div>
                <h3 className="text-[14px] font-semibold text-ink-900">System & Tenant</h3>
                <p className="text-[12px] text-ink-500">MediFlow Cloud Platform</p>
              </div>
            </div>

            <div className="space-y-3 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Organization:</span>
                <span className="font-medium text-ink-900">{tenant.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Edition:</span>
                <span className="badge badge-brand capitalize">{tenant.plan}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Database:</span>
                <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium text-[12px]">
                  <CheckCircle2 className="h-3.5 w-3.5" /> PostgreSQL Connected
                </span>
              </div>
            </div>
          </div>

          {/* GSP & E-Invoice Integration Link Card */}
          <Link
            href="/dashboard/settings/gst"
            className="card p-5 space-y-2 hover:border-brand-300 transition-colors block group"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink-900 group-hover:text-brand-700 flex items-center gap-2 text-sm">
                <Receipt className="w-4 h-4 text-brand-600" /> GSP & E-Invoice API
              </span>
              <span className="text-xs text-brand-600 font-semibold group-hover:underline">Configure →</span>
            </div>
            <p className="text-[12px] text-ink-500 leading-relaxed">
              Configure GSP credentials (Sandbox / Production) for automated NIC IRN and signed QR code generation.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
