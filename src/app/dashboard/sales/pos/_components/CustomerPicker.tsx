"use client";

import { useState, useEffect, type FormEvent } from "react";
import { User, Plus, X, Sparkles, CreditCard, Phone, Loader2 } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { CustomerRow, PosDataSource } from "../_data/posData";
import Link from "next/link";
import { getCustomerPendingDueAction } from "@/app/actions/customer-credit";
import type { SelectedCustomer } from "../_state/types";

interface CustomerPickerProps {
  customer: SelectedCustomer | null;
  dataSource: PosDataSource;
  onSelectCustomer: (customer: SelectedCustomer | null) => void;
  onCustomerRedeemableLoaded?: (points: number, valuePaise: number) => void;
}

export function CustomerPicker({
  customer,
  dataSource,
  onSelectCustomer,
  onCustomerRedeemableLoaded,
}: CustomerPickerProps) {
  const [customersList, setCustomersList] = useState<CustomerRow[]>([]);
  const [query, setQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [consentReminders, setConsentReminders] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Load customer list when dropdown opens or query changes
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const list = await dataSource.getCustomers(query);
        if (active) setCustomersList(list);
      } catch (err) {
        console.error("Error loading customers:", err);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [dataSource, query]);

  // When customer changes, load live redeemable points
  useEffect(() => {
    let active = true;
    if (!customer?.id) return;

    async function loadLoyalty() {
      try {
        const res = await dataSource.getCustomerRedeemablePoints(customer!.id);
        if (active && onCustomerRedeemableLoaded) {
          onCustomerRedeemableLoaded(res.points, res.valuePaise);
        }
      } catch (err) {
        console.error("Error loading loyalty points:", err);
      }
    }
    loadLoyalty();
    return () => {
      active = false;
    };
  }, [customer?.id, dataSource, onCustomerRedeemableLoaded]);

  const handleQuickAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setErrorMsg("Customer name is required");
      return;
    }
    setIsSaving(true);
    setErrorMsg("");
    try {
      const res = await dataSource.createQuickCustomer(newName.trim(), newPhone.trim() || undefined, consentReminders);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }
      if (res.customer) {
        onSelectCustomer({
          id: res.customer.id,
          name: res.customer.name,
          phone: res.customer.phone,
          loyaltyPoints: res.customer.loyaltyPoints ?? 0,
          creditLimit: res.customer.creditLimit,
        });
        setIsQuickAddOpen(false);
        setNewName("");
        setNewPhone("");
        setConsentReminders(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const [pendingDue, setPendingDue] = useState<{
    customerId: string;
    pendingDuePaise: number;
    openBills: number;
  } | null>(null);

  useEffect(() => {
    if (!customer?.id) return;
    let cancelled = false;
    const customerId = customer.id;
    getCustomerPendingDueAction(customerId)
      .then((res) => {
        if (!cancelled) {
          setPendingDue({
            customerId,
            pendingDuePaise: res.pendingDuePaise,
            openBills: res.openBills,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [customer?.id]);

  const activePendingDue =
    customer && pendingDue?.customerId === customer.id ? pendingDue : null;

  return (
    <div className="card p-3 shadow-xs">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-bold text-ink-700 flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-brand-600" />
          <span>Customer & Loyalty</span>
        </label>
        <button
          type="button"
          onClick={() => setIsQuickAddOpen(true)}
          className="text-xs text-brand-600 hover:text-brand-800 font-semibold inline-flex items-center gap-0.5"
        >
          <Plus className="w-3 h-3" /> New (Alt+N)
        </button>
      </div>

      {customer ? (
        <div className="bg-brand-50/60 border border-brand-200 rounded-xl p-2.5 flex items-center justify-between">
          <div>
            <div className="font-bold text-ink-900 text-xs flex items-center gap-1.5">
              <span>{customer.name}</span>
              {customer.phone && (
                <span className="text-ink-500 font-mono text-[11px]">({customer.phone})</span>
              )}
            </div>
            <div className="flex items-center flex-wrap gap-2 mt-1">
              {customer.redeemablePoints !== undefined && customer.redeemablePoints > 0 ? (
                <span className="badge badge-brand !text-[10px] flex items-center gap-0.5 font-bold">
                  <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                  {customer.redeemablePoints} Pts ({formatINR(customer.redeemableValuePaise ?? 0)})
                </span>
              ) : (
                <span className="text-[10.5px] text-ink-400">0 reward points</span>
              )}
              {customer.creditLimit !== undefined && customer.creditLimit !== null && (
                <span className="text-[10.5px] text-ink-500 font-mono">
                  Limit: {formatINR(customer.creditLimit)}
                </span>
              )}
              {activePendingDue && activePendingDue.pendingDuePaise > 0 && (
                <Link
                  href="/dashboard/customers/credit"
                  className="badge !bg-amber-50 !text-amber-800 !border !border-amber-300 !text-[10px] font-bold hover:!bg-amber-100"
                  title={`${activePendingDue.openBills} open credit bill(s) — click to open Udhaar Khata`}
                >
                  Udhaar: {formatINR(activePendingDue.pendingDuePaise)}
                </Link>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelectCustomer(null)}
            className="btn btn-ghost btn-icon !h-6 !w-6 text-ink-400 hover:text-ink-700"
            title="Remove customer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            placeholder="Search customer by name or mobile..."
            className="input !py-1.5 !px-2.5 text-xs"
          />
          {isDropdownOpen && customersList.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-30 card shadow-pop max-h-48 overflow-y-auto">
              {customersList.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelectCustomer(c);
                    setIsDropdownOpen(false);
                    setQuery("");
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-brand-50 border-b border-ink-100 last:border-b-0 flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-ink-900">{c.name}</div>
                    <div className="text-[11px] text-ink-500 font-mono">{c.phone || "No phone"}</div>
                  </div>
                  {c.loyaltyPoints !== undefined && c.loyaltyPoints > 0 && (
                    <span className="badge badge-brand !text-[10px] font-mono">
                      {c.loyaltyPoints} pts
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Add Modal */}
      {isQuickAddOpen && (
        <div className="fixed inset-0 bg-ink-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm p-4 shadow-pop space-y-3">
            <div className="flex items-center justify-between border-b border-ink-100 pb-2">
              <h3 className="font-bold text-sm text-ink-900 flex items-center gap-1.5">
                <User className="w-4 h-4 text-brand-600" /> Quick Add Customer
              </h3>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(false)}
                className="btn btn-ghost btn-icon !h-6 !w-6"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {errorMsg && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-2 rounded-lg">
                {errorMsg}
              </div>
            )}
            <form onSubmit={handleQuickAdd} className="space-y-2.5">
              <div>
                <label className="text-[11px] font-semibold text-ink-600">Full Name *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Ramesh Patel"
                  className="input !py-1.5 text-xs"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-ink-600">Mobile Phone</label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="input !py-1.5 text-xs font-mono"
                />
              </div>
              <div className="pt-1">
                <label className="flex items-start gap-2 cursor-pointer text-[11px] text-ink-600">
                  <input
                    type="checkbox"
                    checked={consentReminders}
                    onChange={(e) => setConsentReminders(e.target.checked)}
                    className="checkbox mt-0.5"
                  />
                  <span>
                    Patient consents to refill alerts &amp; WhatsApp updates (DPDP Opt-in)
                  </span>
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn btn-primary btn-sm"
                >
                  {isSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
