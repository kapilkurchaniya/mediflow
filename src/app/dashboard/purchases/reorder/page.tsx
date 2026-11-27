import React from "react";
import { can, requirePagePermission } from "@/server/rbac";
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

export default async function ReorderPage({
  searchParams,
}: {
  searchParams: Promise<{ onlyBelowMin?: string }>;
}) {
  const ctx = await requirePagePermission("purchase.view");
  const params = await searchParams;

  const [stores, initialReport] = await Promise.all([
    getReorderStoresAction(),
    getReorderSuggestions(ctx.storeId),
  ]);

  return (
    <ReorderClient
      initialReport={initialReport}
      stores={stores}
      currentStoreId={ctx.storeId}
      canCreatePo={can(ctx, "purchase.create")}
      initialOnlyBelowMin={params.onlyBelowMin === "true"}
    />
  );
}
