import { requirePagePermission } from "@/server/rbac";

export default async function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("report.view");
  return <>{children}</>;
}
