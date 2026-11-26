import { PageHeader } from "@/app/components/ui";
import { getStoreSettings } from "@/app/actions/settings";
import { getBillingTemplatesAction } from "@/app/actions/billing-templates";
import { SettingsForm } from "./SettingsForm";
import { BillingTemplateQuickCard } from "./BillingTemplateQuickCard";
import {
  Receipt,
  ShieldCheck,
  CheckCircle2,
  User,
  Sliders,
} from "lucide-react";
import Link from "next/link";
import { requireAuth } from "@/server/auth";
import { requirePagePermission } from "@/server/rbac";
import { ProfileClient } from "./profile/ProfileClient";
import { TooltipSettingsCard } from "./TooltipSettingsCard";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requirePagePermission("settings.manage");
  const [{ user: authUser }, data, templateRows] = await Promise.all([
    requireAuth(),
    getStoreSettings(),
    getBillingTemplatesAction(ctx.storeId),
  ]);
  const { store, user, tenant } = data;
  const storeSettings = "settings" in store ? store.settings : undefined;
  const initialPrintFormat = storeSettings?.printFormat ?? "thermal_80mm";

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
          <BillingTemplateQuickCard
            storeId={ctx.storeId}
            initialPrintFormat={initialPrintFormat}
            initialTemplates={templateRows.map((t) => ({
              id: t.id,
              format: t.format,
              name: t.name,
              isActive: t.isActive,
              sourceType: t.sourceType,
            }))}
          />

          {/* Interface & Guided Feature Tooltips Preference */}
          <TooltipSettingsCard />
        </div>

        {/* Right Column: Account Info, Password & Organization Details */}
        <div className="space-y-6">
          {/* Account Info Card */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-ink-150">
              <div className="flex items-center gap-2.5">
                <User className="h-5 w-5 text-purple-600" />
                <div>
                  <h3 className="text-[14px] font-semibold text-ink-900">Account Info</h3>
                  <p className="text-[12px] text-ink-500">Your sign-in identity &amp; security</p>
                </div>
              </div>
              <Link
                href="/dashboard/settings/profile"
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline shrink-0"
              >
                Google &amp; Profile →
              </Link>
            </div>

            <div className="space-y-3 text-[13px]">
              <div>
                <span className="text-ink-400 text-[11.5px] uppercase font-mono block">Full Name</span>
                <span className="font-medium text-ink-900">{user.name}</span>
              </div>
              <div>
                <span className="text-ink-400 text-[11.5px] uppercase font-mono block">Email Address</span>
                <span className="font-mono text-ink-700 break-all">{user.email}</span>
              </div>
              {user.phone && (
                <div>
                  <span className="text-ink-400 text-[11.5px] uppercase font-mono block">Phone</span>
                  <span className="font-mono text-ink-700">{user.phone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Set / Update Password */}
          <ProfileClient hasPassword={Boolean(authUser.passwordHash)} />

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

          {/* DPDP Patient Privacy Notice Link Card */}
          <Link
            href="/dashboard/settings/privacy"
            className="card p-5 space-y-2 hover:border-brand-300 transition-colors block group"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink-900 group-hover:text-brand-700 flex items-center gap-2 text-sm">
                <ShieldCheck className="w-4 h-4 text-sky-600" /> DPDP Privacy Notice
              </span>
              <span className="text-xs text-brand-600 font-semibold group-hover:underline">Configure →</span>
            </div>
            <p className="text-[12px] text-ink-500 leading-relaxed">
              Configure patient data protection notice, Data Protection Officer contact, and statutory retention policy.
            </p>
          </Link>

          {/* Control Room, Audit Log & Backup Link Card */}
          <Link
            href="/dashboard/settings/control-room"
            className="card p-5 space-y-2 hover:border-brand-300 transition-colors block group"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink-900 group-hover:text-brand-700 flex items-center gap-2 text-sm">
                <Sliders className="w-4 h-4 text-indigo-600" /> Control Room &amp; Audit Log
              </span>
              <span className="text-xs text-brand-600 font-semibold group-hover:underline">Open →</span>
            </div>
            <p className="text-[12px] text-ink-500 leading-relaxed">
              Negative stock policy, regional bill language, GST composition mode, MCA audit edit-log, and JSON backup.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
