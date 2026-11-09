import { Award, FileText, ShieldAlert, Stethoscope } from "lucide-react";
import type { NavItem } from "./types";

export const complianceNav: NavItem[] = [
  { group: "compliance", order: 10, href: "/dashboard/compliance", label: "Drug registers", icon: ShieldAlert, exact: true, permission: "report.view" },
  { group: "compliance", order: 15, href: "/dashboard/compliance/licenses", label: "Licenses & renewals", icon: Award, permission: "report.view" },
  { group: "compliance", order: 20, href: "/dashboard/compliance/schedule-h1", label: "Schedule H1 (Form 35)", icon: ShieldAlert, permission: "report.view" },
  { group: "compliance", order: 30, href: "/dashboard/compliance/prescriptions", label: "Prescriptions (Rx)", icon: FileText, permission: "prescription.approve" },
  { group: "compliance", order: 40, href: "/dashboard/compliance/doctors", label: "Doctor master", icon: Stethoscope, permission: "prescription.approve" },
];
