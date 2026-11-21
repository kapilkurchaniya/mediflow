import React from "react";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { format } from "date-fns";
import {
  Upload,
  Plus,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Database,
} from "lucide-react";
import { getAuthCtx, can } from "@/server/rbac";
import { db, schema } from "@/server/db";
import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@/app/components/ui";
import { ImportHubClient, type ImportHubTab } from "./_components/ImportHubClient";

export const metadata = {
  title: "Data Import & Migration Hub — MediFlow",
};

export default async function ImportHubPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await getAuthCtx();
  const canQuickImport = can(ctx, "inventory.adjust");
  const canMigration = can(ctx, "settings.manage");

  if (!canQuickImport && !canMigration) {
    forbidden();
  }

  const { tab } = await searchParams;
  const initialTab: ImportHubTab =
    tab === "quick" && canQuickImport
      ? "quick"
      : tab === "migration" && canMigration
      ? "migration"
      : canQuickImport
      ? "quick"
      : "migration";

  const jobs = canMigration
    ? await db
        .select({
          id: schema.importJobs.id,
          entity: schema.importJobs.entity,
          source: schema.importJobs.source,
          fileName: schema.importJobs.fileName,
          status: schema.importJobs.status,
          totals: schema.importJobs.totals,
          createdAt: schema.importJobs.createdAt,
          finishedAt: schema.importJobs.finishedAt,
        })
        .from(schema.importJobs)
        .where(eq(schema.importJobs.tenantId, ctx.tenantId))
        .orderBy(desc(schema.importJobs.createdAt))
        .limit(50)
    : [];

  const totalImports = jobs.length;
  const completedJobs = jobs.filter((j) => j.status === "done");
  const totalCreatedRecords = completedJobs.reduce((acc, j) => acc + (j.totals?.created || 0), 0);

  const migrationContent = canMigration ? (
    <div className="space-y-6">
      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between text-xs font-semibold text-ink-500 uppercase">
            <span>Total Migration Jobs</span>
            <FileSpreadsheet className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-ink-900 mt-2">{totalImports}</div>
          <div className="text-xs text-ink-400 mt-1">Uploaded and staged datasets</div>
        </div>

        <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/30">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 uppercase">
            <span>Successfully Committed</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-900 mt-2">{completedJobs.length}</div>
          <div className="text-xs text-emerald-700 mt-1">Completed migration jobs</div>
        </div>

        <div className="p-5 rounded-2xl border border-brand-200 bg-brand-50/30">
          <div className="flex items-center justify-between text-xs font-semibold text-brand-800 uppercase">
            <span>Records Ingested</span>
            <Database className="h-4 w-4 text-brand-600" />
          </div>
          <div className="text-2xl font-bold text-brand-900 mt-2">{totalCreatedRecords.toLocaleString()}</div>
          <div className="text-xs text-brand-700 mt-1">Medicines, batches &amp; accounts created</div>
        </div>
      </div>

      {/* Migration Jobs Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-ink-900">Historical Import Jobs</h3>
            <p className="text-xs text-ink-500 mt-0.5">Track status, staged row validation, and commit summaries</p>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="py-16 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <Upload className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-ink-900">No data imports yet</h4>
              <p className="text-xs text-ink-500 max-w-sm mx-auto">
                Get started by importing your Marg ERP item master or opening stock spreadsheet into MediFlow.
              </p>
            </div>
            <Link href="/dashboard/import/new" className="btn btn-primary btn-sm inline-flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Start First Import
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-ink-700 font-semibold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">File Name &amp; Source</th>
                  <th className="px-5 py-3.5">Entity</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Rows Staged</th>
                  <th className="px-5 py-3.5">Commit Summary</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => {
                  const statusColors: Record<string, string> = {
                    done: "bg-emerald-100 text-emerald-800 border-emerald-200",
                    committing: "bg-brand-100 text-brand-800 border-brand-200",
                    validated: "bg-blue-100 text-blue-800 border-blue-200",
                    mapped: "bg-purple-100 text-purple-800 border-purple-200",
                    uploaded: "bg-slate-100 text-slate-700 border-slate-200",
                    failed: "bg-red-100 text-red-800 border-red-200",
                  };

                  return (
                    <tr key={job.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-ink-900 text-sm flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-slate-400 shrink-0" />
                          <span className="truncate max-w-xs">{job.fileName}</span>
                        </div>
                        <div className="text-[11px] text-ink-400 mt-0.5 uppercase tracking-wider">
                          Preset: {job.source}
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="capitalize font-medium text-ink-800 bg-slate-100 px-2.5 py-1 rounded-md text-xs">
                          {job.entity}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                            statusColors[job.status] || "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {job.status === "done" && <CheckCircle2 className="h-3 w-3" />}
                          {job.status === "failed" && <AlertCircle className="h-3 w-3" />}
                          {job.status === "committing" && <Clock className="h-3 w-3 animate-spin" />}
                          <span className="capitalize">{job.status === "done" ? "Completed" : job.status}</span>
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap font-mono text-ink-700">
                        {job.totals?.rows?.toLocaleString() || 0}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-xs">
                        {job.status === "done" ? (
                          <div className="space-y-0.5">
                            <span className="text-emerald-700 font-semibold">
                              +{job.totals?.created || 0} new
                            </span>
                            {job.totals?.updated ? (
                              <span className="text-blue-700 font-medium ml-2">
                                ({job.totals.updated} updated)
                              </span>
                            ) : null}
                          </div>
                        ) : job.status === "validated" ? (
                          <span className="text-blue-700 font-medium">
                            {job.totals?.valid || 0} valid / {job.totals?.errors || 0} errors
                          </span>
                        ) : (
                          <span className="text-ink-400">In staging</span>
                        )}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-ink-500 text-xs">
                        {format(new Date(job.createdAt), "dd MMM yyyy, HH:mm")}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <Link
                          href={`/dashboard/import/${job.id}`}
                          className="btn btn-secondary btn-sm text-xs inline-flex items-center gap-1"
                        >
                          View Report <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Data Import & Migration Hub"
        description="Quickly drop opening stock CSVs or run the full staged migration wizard for Marg ERP, GoFrugal, customers, and suppliers."
      />

      <ImportHubClient
        initialTab={initialTab}
        canQuickImport={canQuickImport}
        canMigration={canMigration}
        migrationContent={migrationContent}
      />
    </div>
  );
}
