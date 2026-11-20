import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { requirePagePermission } from "@/server/rbac";
import { PrintersAndTemplatesClient } from "./PrintersAndTemplatesClient";

export const metadata = {
  title: "Billing Templates & Printer Settings — MediFlow",
};

export default async function PrintersSettingsPage() {
  const ctx = await requirePagePermission("settings.manage");

  const [storeRows, templateRows] = await Promise.all([
    db
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        code: schema.stores.code,
        settings: schema.stores.settings,
      })
      .from(schema.stores)
      .where(and(eq(schema.stores.tenantId, ctx.tenantId), eq(schema.stores.isActive, true)))
      .orderBy(schema.stores.name),
    db
      .select({
        id: schema.billingTemplates.id,
        storeId: schema.billingTemplates.storeId,
        format: schema.billingTemplates.format,
        name: schema.billingTemplates.name,
        htmlContent: schema.billingTemplates.htmlContent,
        isActive: schema.billingTemplates.isActive,
        sourceType: schema.billingTemplates.sourceType,
      })
      .from(schema.billingTemplates)
      .where(and(eq(schema.billingTemplates.tenantId, ctx.tenantId), eq(schema.billingTemplates.storeId, ctx.storeId)))
      .orderBy(desc(schema.billingTemplates.isActive), desc(schema.billingTemplates.updatedAt)),
  ]);

  const stores = storeRows.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    printFormat: s.settings?.printFormat ?? "thermal_80mm",
  }));

  return (
    <PrintersAndTemplatesClient
      stores={stores}
      initialStoreId={ctx.storeId}
      initialTemplates={templateRows}
    />
  );
}
