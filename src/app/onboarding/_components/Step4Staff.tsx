"use client";

import React, { useState } from "react";
import { ArrowRight, ArrowLeft, Users, AlertCircle, Copy, Check, UserPlus } from "lucide-react";
import { type StaffInviteInput } from "@/server/domain/onboarding/types";

interface Step4StaffProps {
  onBack: () => void;
  onSuccess: () => void;
  onInvite: (input: StaffInviteInput) => Promise<{ success: boolean; token?: string; error?: string }>;
}

export function Step4Staff({ onBack, onSuccess, onInvite }: Step4StaffProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"pharmacist" | "manager" | "cashier">("pharmacist");
  const [regNo, setRegNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !email.includes("@")) {
      setError("Please provide a valid staff email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await onInvite({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        role,
        pharmacistRegNo: regNo.trim() || undefined,
      });

      if (!res.success) {
        setError(res.error || "Failed to generate staff invitation.");
        return;
      }

      setInviteToken(res.token || "token-generated");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error sending invitation.");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!inviteToken) return;
    const url = `${window.location.origin}/invite/${inviteToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-2xl border border-ink-200 shadow-sm p-6 sm:p-8">
      <div className="flex items-center gap-3 pb-6 border-b border-ink-100">
        <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink-900">Pharmacist & Staff Invitation</h2>
          <p className="text-sm text-ink-500">
            Invite your registered dispensing pharmacist or cashier with role templates.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {inviteToken ? (
        <div className="mt-6 p-6 rounded-xl bg-emerald-50 border border-emerald-200">
          <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
            <Check className="w-5 h-5 text-emerald-600" />
            Invitation Link Generated!
          </h3>
          <p className="mt-1 text-xs text-emerald-700">
            Share this link with your staff member to complete account registration.
          </p>

          <div className="mt-4 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${inviteToken}`}
              className="flex-1 px-4 py-2 rounded-lg border border-emerald-300 bg-white text-ink-900 text-xs font-mono"
            />
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleInvite} className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
                Staff Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                className="w-full px-4 py-2.5 rounded-xl border border-ink-200 bg-white text-ink-900 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. ramesh.pharmacist@gmail.com"
                className="w-full px-4 py-2.5 rounded-xl border border-ink-200 bg-white text-ink-900 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
                Role Template
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "pharmacist" | "manager" | "cashier")}
                className="w-full px-4 py-2.5 rounded-xl border border-ink-200 bg-white text-ink-900 text-sm"
              >
                <option value="pharmacist">Registered Pharmacist (POS & Dispense)</option>
                <option value="cashier">Counter Cashier (Billing Only)</option>
                <option value="manager">Store Manager (Purchases & Reports)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
                Pharmacy Council Registration No.
              </label>
              <input
                type="text"
                value={regNo}
                onChange={(e) => setRegNo(e.target.value)}
                placeholder="e.g. MSPC-129482"
                className="w-full px-4 py-2.5 rounded-xl border border-ink-200 bg-white text-ink-900 text-sm font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 rounded-xl border border-brand-600 text-brand-600 hover:bg-brand-50 text-xs font-semibold transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>{loading ? "Generating..." : "Generate Invite Link"}</span>
            </button>
          </div>
        </form>
      )}

      <div className="pt-6 mt-6 border-t border-ink-100 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-ink-200 hover:bg-ink-50 text-ink-700 font-semibold text-sm transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={onSuccess}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <span>Proceed to Test Print Drill</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

