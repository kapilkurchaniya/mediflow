import { PageHeader } from "@/app/components/ui";
import { getMedicalReps } from "@/app/actions/medical-reps";
import { MedicalRepsClient } from "./MedicalRepsClient";
import Link from "next/link";
import { BarChart3 } from "lucide-react";

export const metadata = {
  title: "Medical Representatives — MediFlow",
};

export default async function MedicalRepsPage() {
  const reps = await getMedicalReps();

  return (
    <div className="page space-y-6">
      <PageHeader
        backHref="/dashboard/reports/commissions"
        title="Medical Representatives & Consultants"
        description="Maintain company affiliations and commission percentages for pharma representatives and prescribing doctors."
        actions={
          <Link href="/dashboard/reports/commissions" className="btn btn-secondary btn-sm">
            <BarChart3 className="h-4 w-4" /> Commission Report
          </Link>
        }
      />

      <MedicalRepsClient initialReps={reps} />
    </div>
  );
}
