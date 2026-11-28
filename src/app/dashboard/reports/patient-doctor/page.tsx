import { requirePagePermission } from "@/server/rbac";
import { PatientDoctorClient } from "./PatientDoctorClient";

export const dynamic = "force-dynamic";

export default async function PatientDoctorPage() {
  await requirePagePermission("report.view");
  return <PatientDoctorClient />;
}
