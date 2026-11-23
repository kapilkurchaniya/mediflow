"use client";

import { useState } from "react";
import { Plus, Loader2, MapPin } from "lucide-react";
import { createRack } from "@/app/actions/racks";
import { actionError } from "@/lib/action-result";

export interface RackOption {
  id: string;
  code: string;
  name: string;
}

interface RackSelectorFieldProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (rackId: string) => void;
  racks: RackOption[];
  onRackCreated?: (rack: RackOption) => void;
  className?: string;
}

export function RackSelectorField({
  id = "rackId",
  name,
  value,
  onChange,
  racks,
  onRackCreated,
  className = "",
}: RackSelectorFieldProps) {
  const [localRacks, setLocalRacks] = useState<RackOption[]>(racks);
  const [showCreate, setShowCreate] = useState(false);
  const [code, setCode] = useState("");
  const [rackName, setRackName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Merge external racks with any newly created local racks without duplicates
  const mergedRacks = [...racks];
  for (const lr of localRacks) {
    if (!mergedRacks.some((r) => r.id === lr.id)) {
      mergedRacks.push(lr);
    }
  }

  const handleCreate = async () => {
    const cleanCode = code.trim().toUpperCase();
    const cleanName = rackName.trim() || `Shelf ${cleanCode}`;
    if (!cleanCode) {
      setErr("Enter a rack/shelf code (e.g. R1-S2)");
      return;
    }

    setIsCreating(true);
    setErr(null);
    try {
      const res = await createRack({ code: cleanCode, name: cleanName });
      const actionErr = actionError(res);
      if (actionErr || !res?.data?.rack) {
        setErr(actionErr || "Failed to create rack.");
        return;
      }
      const created: RackOption = {
        id: res.data.rack.id,
        code: res.data.rack.code,
        name: res.data.rack.name,
      };
      setLocalRacks((prev) => [...prev, created]);
      onRackCreated?.(created);
      onChange(created.id);
      setCode("");
      setRackName("");
      setShowCreate(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create rack.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <select
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input flex-1"
        >
          <option value="">— No rack / shelf assigned —</option>
          {mergedRacks.map((r) => (
            <option key={r.id} value={r.id}>
              {r.code} — {r.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setErr(null);
          }}
          className="btn btn-secondary btn-sm shrink-0 inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          New Rack / Shelf
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3 space-y-2 text-xs">
          <div className="font-semibold text-ink-800 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-brand-600" />
            Quick-add Rack &amp; Shelf for this branch
          </div>
          {err && <div className="text-rose-700 font-medium">{err}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Code (e.g. R1-S2)"
              maxLength={20}
              className="input input-sm sm:col-span-2 font-mono uppercase"
            />
            <input
              type="text"
              value={rackName}
              onChange={(e) => setRackName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder="Shelf name (e.g. Front Shelf 2)"
              maxLength={80}
              className="input input-sm sm:col-span-2"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating || !code.trim()}
              className="btn btn-primary btn-sm inline-flex items-center justify-center gap-1"
            >
              {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

