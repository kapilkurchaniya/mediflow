import { notFound } from "next/navigation";
import { requirePermission, can } from "@/server/rbac";
import { getTransferById } from "@/server/domain/inventory/transfers";
import { TransferDetailClient } from "./TransferDetailClient";

interface TransferPageProps {
  params: Promise<{ id: string }>;
}

export default async function TransferPage({ params }: TransferPageProps) {
  const { id } = await params;
  const ctx = await requirePermission("inventory.view");

  let transfer: Awaited<ReturnType<typeof getTransferById>>;
  try {
    transfer = await getTransferById(ctx.tenantId, id);
  } catch {
    notFound();
  }

  const canDispatch = can(ctx, "inventory.transfer");
  const canReceive = can(ctx, "inventory.transfer_receive") || can(ctx, "inventory.transfer");

  return (
    <div className="p-6">
      <TransferDetailClient
        transfer={transfer}
        userStoreId={ctx.storeId}
        canDispatch={canDispatch}
        canReceive={canReceive}
      />
    </div>
  );
}
