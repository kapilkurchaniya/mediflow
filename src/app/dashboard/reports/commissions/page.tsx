import { PageHeader } from "@/app/components/ui";
import { getCommissionReport, getMedicalReps } from "@/app/actions/medical-reps";
import { CommissionReportClient } from "./CommissionReportClient";
import Link from "next/link";
import { UserCheck } from "lucide-react";
import { PrintWatermark } from "@/app/components/PrintWatermark";

export const metadata = {
  title: "MR & Doctor Commissions — MediFlow",
};

export default async function CommissionsReportPage() {
  const [rows, reps] = await Promise.all([
    getCommissionReport(),
    getMedicalReps(),
  ]);

  return (
    <div className="page space-y-6">
      <PrintWatermark />
      <PageHeader
        backHref="/dashboard/reports"
        title="MR & Doctor Commission Report"
        description="Calculate and track prescription brokerage, field representative incentives, and manufacturer-wise commission disbursements."
        actions={
          <Link href="/dashboard/settings/medical-reps" className="btn btn-secondary btn-sm">
            <UserCheck className="h-4 w-4" /> Medical Rep Directory
          </Link>
        }
      />

      <CommissionReportClient initialRows={rows} reps={reps} />
    </div>
  );
}
