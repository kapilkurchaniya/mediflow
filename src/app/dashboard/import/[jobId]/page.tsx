import React from "react";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/rbac";
import { db } from "@/server/db";
import { getImportJob, getImportJobRows } from "@/server/domain/import";
import { PageHeader } from "@/app/components/ui";
import { JobInspectorClient } from "./JobInspectorClient";

export const metadata = {
  title: "Import Job Report — MediFlow",
};

interface ImportJobDetailPageProps {
  params: Promise<{ jobId: string }>;
}

export default async function ImportJobDetailPage({ params }: ImportJobDetailPageProps) {
  const ctx = await requirePagePermission("settings.manage");
  const { jobId } = await params;

  const job = await getImportJob(db, ctx.tenantId, jobId);
  if (!job) {
    notFound();
  }

  const { rows, total } = await getImportJobRows(db, ctx.tenantId, jobId, {
    limit: 25,
    offset: 0,
  });

  return (
    <div className="page space-y-6">
      <PageHeader
        title={`Import Job: ${job.fileName}`}
        description={`Entity: ${job.entity} · Preset: ${job.source} · Created: ${new Date(job.createdAt).toLocaleDateString()}`}
        backHref="/dashboard/import"
      />

      <JobInspectorClient
        job={job}
        initialRows={rows}
        totalRowsCount={total}
      />
    </div>
  );
}

