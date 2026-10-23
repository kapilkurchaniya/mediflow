import { requirePagePermission } from "@/server/rbac";

export default async function NewPurchaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("purchase.create");
  return <>{children}</>;
}
