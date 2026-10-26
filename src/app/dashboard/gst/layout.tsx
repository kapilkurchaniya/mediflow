 import { requirePagePermission } from "@/server/rbac";

export default async function GstLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("gst.view");
  return <>{children}</>;
}
