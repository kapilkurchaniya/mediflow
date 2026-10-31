import React from "react";
import { requirePermission } from "@/server/rbac";
import { getCentralPurchasingInitialDataAction } from "@/app/actions/central-purchasing";
import { CentralPoClient } from "./CentralPoClient";

export const metadata = {
  title: "Central Purchasing & Multi-Branch Split PO | MediFlow",
  description:
    "Order in bulk from a single supplier and split quantities across pharmacy branches with automated child PO generation.",
};

export default async function CentralPurchasingPage() {
  await requirePermission("purchase.view");

  const { suppliers, stores, medicines } =
    await getCentralPurchasingInitialDataAction();

  return (
    <CentralPoClient
      initialSuppliers={suppliers}
      stores={stores}
      initialMedicines={medicines}
    />
  );
}

