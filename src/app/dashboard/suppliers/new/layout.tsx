 import { requirePagePermission } from "@/server/rbac";

export default async function NewSupplierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("supplier.manage");
  return <>{children}</>;
}
