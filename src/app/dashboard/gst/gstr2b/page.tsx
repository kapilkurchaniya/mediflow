import { requirePermission } from "@/server/rbac";
import { PageHeader } from "@/app/components/ui";
import { getGstr2bImportsAction, getGstr2bReconciliationAction } from "@/app/actions/gst-2b";
import { Gstr2bClient } from "./Gstr2bClient";

export const dynamic = "force-dynamic";

export default async function Gstr2bReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ importId?: string }>;
}) {
  await requirePermission("gst.view");
  const resolvedParams = await searchParams;

  const imports = await getGstr2bImportsAction();
  const selectedImportId = resolvedParams.importId || (imports.length > 0 ? imports[0].id : null);

  let activeReconciliation = null;
  if (selectedImportId) {
    activeReconciliation = await getGstr2bReconciliationAction(selectedImportId);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="GSTR-2B & IMS Reconciliation"
        description="Reconcile auto-drafted portal inward supplies with purchase books and submit IMS (Invoice Management System) actions"
        backHref="/dashboard/gst"
      />

      <Gstr2bClient
        imports={imports}
        selectedImportId={selectedImportId}
        reconciliation={activeReconciliation}
      />
    </div>
  );
}

