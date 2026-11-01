"use client";

import { useState } from "react";
import {
  Users,
  Plus,
  ChevronRight,
  ChevronDown,
  Phone,
  Shield,
  CreditCard,
  UserPlus,
  Receipt,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  createCustomerGroup,
  addCustomerToGroup,
  removeCustomerFromGroup,
  getFamilyGroupDetails,
} from "@/app/actions/customer-groups";
import clsx from "clsx";

interface GroupItem {
  id: string;
  name: string;
  creditLimit: number | null;
  notes: string | null;
  createdAt: Date;
  memberCount: number;
}

interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
}

export function CustomerGroupsClient({
  initialGroups,
  allCustomers,
}: {
  initialGroups: GroupItem[];
  allCustomers: CustomerOption[];
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(initialGroups[0]?.id || null);
  const [groupDetails, setGroupDetails] = useState<Awaited<ReturnType<typeof getFamilyGroupDetails>> | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Modals
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedCustomerToAdd, setSelectedCustomerToAdd] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load details on group select
  const loadGroup = async (groupId: string) => {
    setSelectedGroupId(groupId);
    setLoadingDetails(true);
    const data = await getFamilyGroupDetails(groupId);
    setGroupDetails(data);
    setLoadingDetails(false);
  };

  // Initial load
  useState(() => {
    if (initialGroups[0]?.id) {
      loadGroup(initialGroups[0].id);
    }
  });

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const res = await createCustomerGroup(formData);

    if (res.error) {
      setError(res.error);
    } else if (res.group) {
      const newG: GroupItem = {
        ...res.group,
        memberCount: 0,
      };
      setGroups([newG, ...groups]);
      setShowCreateGroup(false);
      loadGroup(res.group.id);
    }
    setPending(false);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || !selectedCustomerToAdd) return;
    setPending(true);
    setError(null);

    const res = await addCustomerToGroup(selectedGroupId, selectedCustomerToAdd);
    if (res.error) {
      setError(res.error);
    } else {
      setShowAddMember(false);
      setSelectedCustomerToAdd("");
      loadGroup(selectedGroupId);
      setGroups((prev) =>
        prev.map((g) => (g.id === selectedGroupId ? { ...g, memberCount: g.memberCount + 1 } : g))
      );
    }
    setPending(false);
  };

  const handleRemoveMember = async (customerId: string) => {
    if (!confirm("Remove this member from the family group?")) return;
    const res = await removeCustomerFromGroup(customerId);
    if (res.success && selectedGroupId) {
      loadGroup(selectedGroupId);
      setGroups((prev) =>
        prev.map((g) => (g.id === selectedGroupId ? { ...g, memberCount: Math.max(0, g.memberCount - 1) } : g))
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-500">
          Group multiple patient accounts under a shared household credit limit and unified ledger.
        </p>
        <button
          type="button"
          onClick={() => setShowCreateGroup(true)}
          className="btn btn-primary btn-sm"
        >
          <Plus className="h-4 w-4" /> New Family Group
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Groups List */}
        <div className="lg:col-span-4 space-y-2">
          {groups.length === 0 ? (
            <div className="card p-8 text-center text-ink-400 text-xs">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No family groups created yet.
            </div>
          ) : (
            groups.map((g) => {
              const isSelected = g.id === selectedGroupId;
              return (
                <div
                  key={g.id}
                  onClick={() => loadGroup(g.id)}
                  className={clsx(
                    "card p-4 cursor-pointer transition-all border",
                    isSelected
                      ? "border-primary-500 bg-primary-50/20 shadow-xs"
                      : "hover:border-ink-300 bg-surface"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm text-ink-900">{g.name}</h4>
                    <span className="badge badge-neutral text-[10.5px]">
                      {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                    </span>
                  </div>

                  {g.creditLimit ? (
                    <div className="text-xs text-ink-500 mt-2 flex items-center gap-1 font-mono">
                      <CreditCard className="h-3 w-3 text-ink-400" />
                      Credit Limit: ₹{(g.creditLimit / 100).toFixed(2)}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {/* Right: Group Detail & Consolidated Ledger */}
        <div className="lg:col-span-8 space-y-4">
          {selectedGroupId && groupDetails?.summary ? (
            <>
              {/* Family Header Card */}
              <div className="card p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink-150 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-ink-900">{groupDetails.summary.group.name}</h3>
                    <p className="text-xs text-ink-500 mt-0.5">
                      Unified family account · {groupDetails.summary.members.length} registered patient profiles
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddMember(true)}
                    className="btn btn-secondary btn-sm"
                  >
                    <UserPlus className="h-4 w-4" /> Add Family Member
                  </button>
                </div>

                {/* Balance Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-ink-50 border border-ink-100">
                    <span className="text-[11px] text-ink-500 font-medium block">
                      Combined Outstanding
                    </span>
                    <span className="text-xl font-bold font-mono text-ink-900 block mt-1">
                      ₹{((groupDetails.summary.combinedOutstandingPaise || 0) / 100).toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-ink-50 border border-ink-100">
                    <span className="text-[11px] text-ink-500 font-medium block">
                      Pooled Credit Limit
                    </span>
                    <span className="text-xl font-bold font-mono text-ink-900 block mt-1">
                      {groupDetails.summary.group.creditLimit
                        ? `₹${(groupDetails.summary.group.creditLimit / 100).toFixed(2)}`
                        : "Unlimited"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-ink-50 border border-ink-100">
                    <span className="text-[11px] text-ink-500 font-medium block">Total Family Purchases</span>
                    <span className="text-xl font-bold font-mono text-emerald-600 block mt-1">
                      ₹{((groupDetails.summary.totalSalesPaise || 0) / 100).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Members list */}
                <div>
                  <h4 className="text-xs font-semibold text-ink-800 uppercase tracking-wider mb-2">
                    Household Members
                  </h4>
                  <div className="divide-y divide-ink-100 border border-ink-150 rounded-lg overflow-hidden">
                    {groupDetails.summary.members.map((m) => (
                      <div key={m.id} className="p-3 flex items-center justify-between text-xs bg-white">
                        <div>
                          <span className="font-semibold text-ink-900">{m.name}</span>
                          <span className="text-ink-500 ml-2 font-mono">+{m.phone || "No phone"}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="badge badge-neutral text-[10.5px]">
                            {m.loyaltyPoints || 0} pts
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(m.id)}
                            className="text-rose-600 hover:text-rose-800 text-[11px]"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Combined Ledger */}
              <div className="card overflow-hidden">
                <div className="p-4 border-b border-ink-150 bg-ink-50/50 flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-ink-900">Consolidated Family Bill History</h3>
                  <span className="text-xs text-ink-500">{groupDetails.ledger.length} bills</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Invoice #</th>
                        <th>Patient Name</th>
                        <th className="text-right">Total (₹)</th>
                        <th className="text-right">Paid (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupDetails.ledger.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-8 text-ink-400 text-xs">
                            No bills found for this household yet.
                          </td>
                        </tr>
                      ) : (
                        groupDetails.ledger.map((s) => (
                          <tr key={s.id}>
                            <td className="font-mono text-xs text-ink-600">
                              {new Date(s.date).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </td>
                            <td className="font-mono text-xs font-semibold text-ink-900">{s.invoiceNo}</td>
                            <td className="text-xs text-ink-800">{s.patientName}</td>
                            <td className="text-right font-mono text-xs font-semibold text-ink-900">
                              ₹{((s.totalAmount || 0) / 100).toFixed(2)}
                            </td>
                            <td className="text-right font-mono text-xs text-emerald-600">
                              ₹{((s.paidAmount || 0) / 100).toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="card p-12 text-center text-ink-400 text-sm">
              Select a family group to view unified credit limits and ledger transactions.
            </div>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-ink-150 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-ink-150 bg-ink-50 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-ink-900">Create Family Group</h3>
              <button
                type="button"
                onClick={() => setShowCreateGroup(false)}
                className="text-ink-400 hover:text-ink-700 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-4">
              {error && (
                <div className="alert-error text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">Family / Household Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Gupta Family (Green Park)"
                  className="input input-sm w-full"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">Pooled Credit Limit (₹)</label>
                <input
                  type="number"
                  name="creditLimit"
                  placeholder="10000"
                  className="input input-sm w-full font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">Notes / Address</label>
                <input
                  type="text"
                  name="notes"
                  placeholder="House 42, Sector 15"
                  className="input input-sm w-full"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-ink-150">
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="btn btn-primary btn-sm"
                >
                  <Check className="h-4 w-4" /> {pending ? "Creating…" : "Save Group"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-ink-150 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-ink-150 bg-ink-50 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-ink-900">Add Member to Household</h3>
              <button
                type="button"
                onClick={() => setShowAddMember(false)}
                className="text-ink-400 hover:text-ink-700 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAddMember} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">Select Customer Profile</label>
                <select
                  value={selectedCustomerToAdd}
                  onChange={(e) => setSelectedCustomerToAdd(e.target.value)}
                  required
                  className="select input-sm w-full"
                >
                  <option value="">— Select Customer —</option>
                  {allCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(+${c.phone})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-ink-150">
                <button
                  type="button"
                  onClick={() => setShowAddMember(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || !selectedCustomerToAdd}
                  className="btn btn-primary btn-sm"
                >
                  <Check className="h-4 w-4" /> Add to Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
