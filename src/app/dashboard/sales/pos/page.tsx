"use client";

import { useShell } from "@/app/components/ShellContext";
import { WarehousePosNotice } from "./WarehousePosNotice";
import { RetailPosTerminal } from "./_components/RetailPosTerminal";

export default function POSPage() {
  const { currentStore } = useShell();

  // Task A3.5: Warehouse Mode refusal screen
  if (currentStore?.kind === "warehouse") {
    return <WarehousePosNotice currentStore={currentStore} />;
  }

  return <RetailPosTerminal />;
}
