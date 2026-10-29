import { requirePagePermission } from "@/server/rbac";
import { getSuppliers } from "@/app/actions/suppliers";
import { getMedicines } from "@/app/actions/inventory";
import { NewOrderClient } from "./NewOrderClient";

export const metadata = { title: "New Purchase Order" };

export default async function NewPurchaseOrderPage() {
  await requirePagePermission("purchase.create");

  const [suppliers, medicinesRes] = await Promise.all([
    getSuppliers(),
    getMedicines("", 1000),
  ]);

  const medicines = medicinesRes.map((m) => ({
    id: m.medicine.id,
    name: m.medicine.name,
    genericName: m.medicine.genericName,
    packSize: m.medicine.packSize,
    mrp: m.medicine.mrp,
  }));

  return <NewOrderClient suppliers={suppliers} medicines={medicines} />;
}

