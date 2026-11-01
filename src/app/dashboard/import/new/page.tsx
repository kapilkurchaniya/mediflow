import React from "react";
import { requirePagePermission } from "@/server/rbac";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/app/components/ui";
import { ImportWizard } from "../ImportWizard";
import { ImportEntity } from "@/server/domain/import/types";

export const metadata = {
  title: "New Import Wizard — MediFlow",
};

interface NewImportPageProps {
  searchParams: Promise<{ entity?: string }>;
}

export default async function NewImportPage({ searchParams }: NewImportPageProps) {
  const ctx = await requirePagePermission("settings.manage");
  const params = await searchParams;

  const validEntity =
    params.entity && ["medicines", "batches", "customers", "suppliers"].includes(params.entity)
      ? (params.entity as ImportEntity)
      : undefined;

  // Fetch tenant stores for opening stock branch selection
  const stores = await db
    .select({
      id: schema.stores.id,
      name: schema.stores.name,
      code: schema.stores.code,
    })
    .from(schema.stores)
    .where(eq(schema.stores.tenantId, ctx.tenantId));

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Onboarding & Import Wizard"
        description="Follow the 5-step guided wizard to stage, map, validate, and commit data from Marg ERP or other legacy software."
        backHref="/dashboard/import"
      />

      <ImportWizard
        initialEntity={validEntity}
        stores={stores}
        defaultStoreId={ctx.storeId}
      />
    </div>
  );
}

