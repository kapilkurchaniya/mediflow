import React from "react";
import { getDoctors } from "@/app/actions/compliance";
import { DoctorsView } from "./DoctorsView";

export const metadata = {
  title: "Doctor Registry & Prescribers | MediFlow",
  description: "Prescriber Medical Council registration records for prescription auditing and drug compliance.",
};

export default async function DoctorsPage() {
  const doctors = await getDoctors();

  return <DoctorsView initialDoctors={doctors as any} />;
}
