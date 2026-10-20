import { requirePagePermission } from "@/server/rbac";

/**
 * The page next to this file is a client component, which cannot call server-side checks, so the permission
 * is checked here. (Data actions behind the page enforce permissions as well.)
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePagePermission("medicine.manage");
  return children;
}
