"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { BranchSettingsDialog } from "./BranchSettingsDialog";

interface BranchSettingsButtonProps {
  medicine: {
    id: string;
    name: string;
    reorderLevel: number;
    maxStock: number;
    salePrice: number | null;
  };
  branchSettings?: {
    reorderLevel: number | null;
    maxStock: number | null;
    rackId: string | null;
    salePriceOverride: number | null;
  } | null;
  racks: Array<{ id: string; code: string; name: string }>;
}

export function BranchSettingsButton({
  medicine,
  branchSettings,
  racks,
}: BranchSettingsButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-1 rounded text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
        title="Configure branch settings (Rack, Reorder, Price override)"
      >
        <Settings2 className="w-4 h-4" />
      </button>

      {open && (
        <BranchSettingsDialog
          medicine={medicine}
          initialSettings={branchSettings}
          racks={racks}
          isOpen={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
