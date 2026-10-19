import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { PageHeader } from "@/app/components/ui";
import { NewPromiseOrderForm } from "./NewPromiseOrderForm";

export const dynamic = "force-dynamic";

export default async function NewPromiseOrderPage() {
  const { session } = await requireAuth();

  const [medicines, customers] = await Promise.all([
    db
      .select({ id: schema.medicines.id, name: schema.medicines.name })
      .from(schema.medicines)
      .where(eq(schema.medicines.tenantId, session.tenantId))
      .orderBy(schema.medicines.name),
    db
      .select({ id: schema.customers.id, name: schema.customers.name, phone: schema.customers.phone })
      .from(schema.customers)
      .where(eq(schema.customers.tenantId, session.tenantId))
      .orderBy(schema.customers.name),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/dashboard/sales/promise-orders"
        eyebrow="Out-of-Stock Demand Capture"
        title="Record New Promise Order"
        description="Log customer requirements for medicines that are currently out of stock."
      />

      <NewPromiseOrderForm medicines={medicines} customers={customers} />
    </div>
  );
}
