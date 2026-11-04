"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { createExpenseAccountAction } from "@/app/actions/expenses";

interface ExpenseCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoryCreated: (category: { id: string; name: string; code: string }) => void;
}

export function ExpenseCategoryModal({
  isOpen,
  onClose,
  onCategoryCreated,
}: ExpenseCategoryModalProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await createExpenseAccountAction({
        name: name.trim(),
        code: code.trim() || undefined,
      });

      if (res?.data) {
        onCategoryCreated(res.data);
        setName("");
        setCode("");
        onClose();
      } else if (res?.serverError) {
        setError(res.serverError);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-md bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-ink-150 pb-3">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-brand-600" />
            <h3 className="font-semibold text-ink-900">New Expense Category</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-md bg-rose-50 p-3 text-[13px] text-rose-700 border border-rose-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[13px] font-medium text-ink-700">
              Category Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Courier & Parcel Charges"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input mt-1 w-full"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-ink-700">
              Custom Code <span className="text-ink-400 text-[11px] font-normal">(Optional, auto-allocated 4160-4199 if blank)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 4160"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={4}
              className="input mt-1 w-full font-mono text-[13px]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn btn-ghost text-[13px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="btn btn-primary text-[13px]"
            >
              {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Create Category
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
