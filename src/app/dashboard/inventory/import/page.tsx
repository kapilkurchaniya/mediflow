import { redirect } from "next/navigation";

export default function LegacyInventoryImportRedirectPage() {
  redirect("/dashboard/import?tab=quick");
}
