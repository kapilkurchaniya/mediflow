import React from "react";
import { requirePermission } from "@/server/rbac";
import {
  getReorderSuggestions,
  getReorderStoresAction,
} from "@/app/actions/reorder";
import { ReorderClient } from "./ReorderClient";

export const metadata = {
  title: "Automated Reorder Suggestions | MediFlow",
  description:
    "AI & sales velocity-based inventory reorder recommendations with 1-click supplier purchase orders.",
};

export default async function ReorderPage() {
  const ctx = await requirePermission("purchase.view");

  const [stores, initialReport] = await Promise.all([
    getReorderStoresAction(),
    getReorderSuggestions(ctx.storeId),
  ]);

  return (
    <ReorderClient
      initialReport={initialReport}
      stores={stores}
      currentStoreId={ctx.storeId}
    />
  );
}
