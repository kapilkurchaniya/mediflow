import { Award, FileText, ShieldAlert, Stethoscope } from "lucide-react";
import type { NavItem } from "./types";

export const complianceNav: NavItem[] = [
  { group: "compliance", order: 10, href: "/dashboard/compliance", label: "Drug registers", icon: ShieldAlert, exact: true, description: "Statutory Schedule H, H1, X & Narcotics dispensing registers", permission: "report.view" },
  { group: "compliance", order: 15, href: "/dashboard/compliance/licenses", label: "Licenses & renewals", icon: Award, description: "Track store drug licenses & pharmacist registration expiry alerts", permission: "report.view" },
  { group: "compliance", order: 20, href: "/dashboard/compliance/schedule-h1", label: "Schedule H1 (Form 35)", icon: ShieldAlert, description: "Mandatory 3-year antibiotic & Schedule H1 Form 35 register", permission: "report.view" },
  { group: "compliance", order: 30, href: "/dashboard/compliance/prescriptions", label: "Prescriptions (Rx)", icon: FileText, description: "Verify, approve & archive patient prescriptions linked to bills", permission: "prescription.approve" },
  { group: "compliance", order: 40, href: "/dashboard/compliance/doctors", label: "Doctor master", icon: Stethoscope, description: "Directory of prescribing doctors & registration numbers", permission: "prescription.approve" },
];
