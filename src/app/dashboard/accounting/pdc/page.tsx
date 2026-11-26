import { requirePagePermission } from "@/server/rbac";
import { PageHeader } from "@/app/components/ui";
import { getPdcPageDataAction } from "@/app/actions/pdc";
import { PdcClient } from "./PdcClient";

export const metadata = {
  title: "PDC Cheque Register | MediFlow Accounting",
};

export default async function PdcPage() {
  await requirePagePermission("accounting.view");
  const data = await getPdcPageDataAction();

  return (
    <div className="page space-y-6">
      <PageHeader
        eyebrow="Banking & Cheques"
        title="Post-Dated Cheque (PDC) Register"
        description="Track inward and outward post-dated cheques through Pay-in-Slip, Bank Clearance, and Dishonour."
      />
      <PdcClient cheques={data.cheques} customers={data.customers} suppliers={data.suppliers} />
    </div>
  );
}
