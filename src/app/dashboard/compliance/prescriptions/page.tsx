import React from "react";
import { getPrescriptions, getDoctors } from "@/app/actions/compliance";
import { PrescriptionsView } from "./PrescriptionsView";
import { requirePagePermission } from "@/server/rbac";

export const metadata = {
  title: "Prescription Repository (Rx Master) | MediFlow",
  description: "Digital prescription storage with doctor registration validation and one-click POS billing.",
};

export default async function PrescriptionsPage() {
  await requirePagePermission("prescription.approve");
  const prescriptions = await getPrescriptions({});
  const doctors = await getDoctors();

  return (
    <PrescriptionsView
      initialPrescriptions={prescriptions as any}
      doctorsList={doctors.map((d) => ({ id: d.id, name: d.name, regNo: d.regNo }))}
    />
  );
}
