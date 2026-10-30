import React from "react";
import { getDoctors } from "@/app/actions/compliance";
import { DoctorsView } from "./DoctorsView";
import { requirePagePermission } from "@/server/rbac";

export const metadata = {
  title: "Doctor Registry & Prescribers | MediFlow",
  description: "Prescriber Medical Council registration records for prescription auditing and drug compliance.",
};

export default async function DoctorsPage() {
  await requirePagePermission("prescription.approve");
  const doctors = await getDoctors();

  return <DoctorsView initialDoctors={doctors} />;
}
