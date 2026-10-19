import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { PageHeader } from "@/app/components/ui";
import { NewSchemeForm } from "./NewSchemeForm";

export const dynamic = "force-dynamic";

export default async function NewSchemePage() {
  const { session } = await requireAuth();

  const [medicines, suppliers, categories] = await Promise.all([
    db
      .select({ id: schema.medicines.id, name: schema.medicines.name })
      .from(schema.medicines)
      .where(eq(schema.medicines.tenantId, session.tenantId))
      .orderBy(schema.medicines.name),
    db
      .select({ id: schema.suppliers.id, name: schema.suppliers.name })
      .from(schema.suppliers)
      .where(eq(schema.suppliers.tenantId, session.tenantId))
      .orderBy(schema.suppliers.name),
    db
      .select({ id: schema.categories.id, name: schema.categories.name })
      .from(schema.categories)
      .where(eq(schema.categories.tenantId, session.tenantId))
      .orderBy(schema.categories.name),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/dashboard/settings/schemes"
        eyebrow="Promotion Configuration"
        title="Create New Scheme"
        description="Set up automatic Buy X Get Y deals, cash discounts, or supplier trade promotions."
      />

      <NewSchemeForm
        medicines={medicines}
        suppliers={suppliers}
        categories={categories}
      />
    </div>
  );
}
