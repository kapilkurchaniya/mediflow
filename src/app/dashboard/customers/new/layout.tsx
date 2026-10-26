 import { requirePagePermission } from "@/server/rbac";

export default async function NewCustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("customer.manage");
  return <>{children}</>;
}
