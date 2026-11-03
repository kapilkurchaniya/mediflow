import { requirePagePermission } from "@/server/rbac";
import { db } from "@/server/db";
import { listStores } from "@/server/domain/stores";
import { listDevices } from "@/server/domain/devices";
import { DevicesView } from "./DevicesView";

export const metadata = {
  title: "Billing Terminals — Settings",
  description: "Manage counter workstations and offline POS pairing tokens.",
};

export default async function DevicesPage() {
  const ctx = await requirePagePermission("settings.manage");
  const [stores, devices] = await Promise.all([
    listStores(db, ctx.tenantId),
    listDevices(db, ctx.tenantId),
  ]);

  return (
    <DevicesView
      initialStores={stores}
      initialDevices={devices}
      currentStoreId={ctx.storeId}
    />
  );
}
