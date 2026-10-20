"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Layers,
  Plus,
  Trash2,
  Edit2,
  Boxes,
  CheckCircle2,
  Search,
  X,
  Loader2,
} from "lucide-react";
import { createRack, updateRack, deleteRack } from "@/app/actions/racks";
import { actionError } from "@/lib/action-result";

export interface RackItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  medicineCount: number;
}

export function RacksListClient({ initialRacks }: { initialRacks: RackItem[] }) {
  const [racks, setRacks] = useState(initialRacks);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = racks.filter((r) => {
    const q = search.toLowerCase();
    return r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
  });

  function openCreate() {
    setEditId(null);
    setCode("");
    setName("");
    setDescription("");
    setError(null);
    setModalOpen(true);
  }

  function openEdit(rack: RackItem) {
    setEditId(rack.id);
    setCode(rack.code);
    setName(rack.name);
    setDescription(rack.description || "");
    setError(null);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (editId) {
        const res = await updateRack({ id: editId, code, name, description });
        const err = actionError(res);
        if (err) {
          setError(err);
        } else if (res?.data) {
          const rack = res.data.rack;
          setRacks((prev) =>
            prev.map((r) =>
              r.id === editId ? { ...r, code: rack.code, name: rack.name, description: rack.description } : r
            )
          );
          setModalOpen(false);
        }
      } else {
        const res = await createRack({ code, name, description });
        const err = actionError(res);
        if (err) {
          setError(err);
        } else if (res?.data) {
          const rack = res.data.rack;
          setRacks((prev) => [
            ...prev,
            {
              id: rack.id,
              code: rack.code,
              name: rack.name,
              description: rack.description,
              isActive: rack.isActive,
              createdAt: rack.createdAt,
              medicineCount: 0,
            },
          ]);
          setModalOpen(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, code: string) {
    if (!confirm(`Are you sure you want to delete rack '${code}'? Any medicines assigned will be unlinked.`)) return;
    const res = await deleteRack({ id });
    const err = actionError(res);
    if (err) {
      alert(err);
      return;
    }
    setRacks((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* Top Search & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink-150 pb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search racks by code or name..."
            className="input text-xs pl-8.5"
          />
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="btn btn-primary text-xs shrink-0 self-start sm:self-auto"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Rack / Shelf
        </button>
      </div>

      {/* Racks Grid / Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table w-full text-xs">
            <thead>
              <tr className="border-b border-ink-150 bg-ink-50/50 text-left font-semibold text-ink-600">
                <th className="py-2.5 px-4">Rack Code</th>
                <th className="py-2.5 px-4">Rack / Shelf Name</th>
                <th className="py-2.5 px-4">Location Description</th>
                <th className="py-2.5 px-4 text-center">Medicines Stored</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-150">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-ink-400">
                    No racks configured yet. Click &quot;+ Add Rack / Shelf&quot; to organize your pharmacy storage.
                  </td>
                </tr>
              ) : (
                filtered.map((rack) => (
                  <tr key={rack.id} className="hover:bg-ink-50/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-ink-900 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                        <Layers className="h-3 w-3" /> {rack.code}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-ink-900">{rack.name}</td>
                    <td className="py-3 px-4 text-ink-600">
                      {rack.description || <span className="text-ink-400 italic">No notes</span>}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-semibold">
                      <span className="inline-flex items-center gap-1 text-ink-700">
                        <Boxes className="h-3.5 w-3.5 text-ink-400" />
                        {rack.medicineCount} items
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(rack)}
                          className="btn btn-ghost text-xs p-1 text-ink-600 hover:text-ink-900"
                          title="Edit Rack"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(rack.id, rack.code)}
                          className="btn btn-ghost text-xs p-1 text-red-600 hover:bg-red-50"
                          title="Delete Rack"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add / Edit Rack */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSave}
            className="card max-w-md w-full p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-ink-150">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-brand-600" />
                <h3 className="text-sm font-bold text-ink-900">
                  {editId ? "Edit Rack Location" : "Add New Rack / Shelf"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="btn btn-ghost btn-icon h-7 w-7"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <div className="p-2.5 text-xs bg-red-50 text-red-800 rounded border border-red-200">
                {error}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="label">Rack / Shelf Code *</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. R1-S3, ROW-A, FRIDGE-2"
                  className="input text-xs font-mono"
                  required
                />
                <span className="text-[11px] text-ink-400 mt-1 block">
                  Short unique locator code shown on POS search results.
                </span>
              </div>

              <div>
                <label className="label">Rack / Shelf Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Front Counter Shelf Top"
                  className="input text-xs"
                  required
                />
              </div>

              <div>
                <label className="label">Description / Storage Notes (Optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Antibiotics and pain relievers, middle row"
                  rows={2}
                  className="input text-xs"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-ink-150 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary text-xs"
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                {editId ? "Save Changes" : "Create Rack"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
