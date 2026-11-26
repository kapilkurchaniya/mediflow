"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, X, Check, Loader2, Shield } from "lucide-react";
import { PageHeader } from "@/app/components/ui";
import { createCustomRoleAction, updateCustomRoleAction } from "@/app/actions/users";

export interface RoleOverviewItem {
  id: string;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: Array<{ key: string; label: string }>;
  count: number;
  total: number;
}

export function RolesClient({
  initialRoles,
  allPermissions,
}: {
  initialRoles: RoleOverviewItem[];
  allPermissions: Array<{ key: string; label: string }>;
}) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleOverviewItem | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const openCreateModal = () => {
    setEditingRole(null);
    setName("");
    setDescription("");
    setSelectedPerms([]);
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (role: RoleOverviewItem) => {
    setEditingRole(role);
    setName(role.name);
    setDescription(role.description);
    setSelectedPerms(role.permissions.map((p) => p.key));
    setError(null);
    setIsModalOpen(true);
  };

  const togglePerm = (key: string) => {
    setSelectedPerms((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Role name is required.");
      return;
    }
    if (selectedPerms.length === 0) {
      setError("Select at least one permission.");
      return;
    }

    startTransition(async () => {
      const res = editingRole
        ? await updateCustomRoleAction({
            roleId: editingRole.id,
            name: name.trim(),
            description: description.trim(),
            permissions: selectedPerms,
          })
        : await createCustomRoleAction({
            name: name.trim(),
            description: description.trim(),
            permissions: selectedPerms,
          });

      if (res?.serverError) {
        setError(res.serverError);
        return;
      }

      setIsModalOpen(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/dashboard/settings/users"
        eyebrow="People & access"
        title="Roles & permissions"
        description="Built-in system roles and custom store roles. Assign a role to any team member on Staff & access."
        actions={
          <button
            type="button"
            onClick={openCreateModal}
            className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            New Custom Role
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {initialRoles.map((r) => (
          <section key={r.id} className="card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold text-ink-900">{r.name}</h2>
                {!r.isSystem && (
                  <span className="badge badge-info !text-[10px]">Custom</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-ink-500">
                  {r.count} of {r.total} permissions
                </span>
                {!r.isSystem && (
                  <button
                    type="button"
                    onClick={() => openEditModal(r)}
                    className="btn btn-secondary btn-xs inline-flex items-center gap-1"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-[13px] text-ink-500">
              {r.description || "Custom pharmacy role"}
            </p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {r.permissions.map((p) => (
                <li
                  key={p.key}
                  className="rounded-full border border-ink-150 bg-ink-50 px-2 py-0.5 text-[11.5px] text-ink-700"
                  title={p.key}
                >
                  {p.label}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-ink-200 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-ink-150 bg-ink-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-brand-600" />
                <h3 className="font-bold text-ink-900 text-sm">
                  {editingRole ? `Edit Role: ${editingRole.name}` : "Create Custom Role"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="btn btn-ghost btn-icon"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
              {error && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label required">Role Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Senior Dispenser"
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="label">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional summary"
                    className="input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="label !mb-0">
                    Permissions ({selectedPerms.length} selected)
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedPerms(allPermissions.map((p) => p.key))}
                      className="text-brand-600 hover:underline font-medium"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPerms([])}
                      className="text-ink-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto border border-ink-150 rounded-xl p-3 bg-ink-50/40">
                  {allPermissions.map((perm) => {
                    const checked = selectedPerms.includes(perm.key);
                    return (
                      <label
                        key={perm.key}
                        className="flex items-start gap-2 text-xs text-ink-800 cursor-pointer hover:bg-white rounded-lg p-1.5"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePerm(perm.key)}
                          className="mt-0.5 rounded border-ink-300"
                        />
                        <span>
                          <span className="font-medium block">{perm.label}</span>
                          <span className="text-[10.5px] font-mono text-ink-400">{perm.key}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-ink-150 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {isPending ? "Saving…" : editingRole ? "Save Changes" : "Create Role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
