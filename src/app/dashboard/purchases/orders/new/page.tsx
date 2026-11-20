import { can, requirePagePermission } from "@/server/rbac";
import { getSuppliers } from "@/app/actions/suppliers";
import { getMedicines } from "@/app/actions/inventory";
import { NewOrderClient } from "./NewOrderClient";

export const metadata = { title: "New Purchase Order" };

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string }>;
}) {
  const ctx = await requirePagePermission("purchase.create");
  const { supplierId } = await searchParams;

  const [suppliers, medicinesRes] = await Promise.all([
    getSuppliers("", 500, 0, true),
    getMedicines("", 1000),
  ]);

  const medicines = medicinesRes.map((m) => ({
    id: m.medicine.id,
    name: m.medicine.name,
    genericName: m.medicine.genericName,
    packSize: m.medicine.packSize,
    mrp: m.medicine.mrp,
  }));

  return (
    <NewOrderClient
      suppliers={suppliers}
      medicines={medicines}
      canManageSuppliers={can(ctx, "supplier.manage")}
      initialSupplierId={supplierId}
    />
  );
}
