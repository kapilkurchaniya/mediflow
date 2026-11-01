"use client";

import { useState } from "react";
import {
  Bell,
  Plus,
  Send,
  Calendar,
  Phone,
  Pill,
  CheckCircle2,
  Clock,
  Ban,
  AlertCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import { triggerDueRemindersBatch, cancelReminder, createManualReminder } from "@/app/actions/reminders";
import clsx from "clsx";

interface ReminderItem {
  id: string;
  customerName: string | null;
  customerPhone: string;
  type: string;
  scheduledDate: string;
  message: string;
  channel: string;
  status: string;
  sentAt: Date | null;
  createdAt: Date;
  medicineName: string | null;
}

export function RemindersClient({
  initialReminders,
  medicines,
}: {
  initialReminders: ReminderItem[];
  medicines: { id: string; name: string }[];
}) {
  const [reminders, setReminders] = useState(initialReminders);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalPending, setModalPending] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const filtered = reminders.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (r.customerName && r.customerName.toLowerCase().includes(q)) ||
        r.customerPhone.includes(q) ||
        (r.medicineName && r.medicineName.toLowerCase().includes(q)) ||
        r.message.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const dueCount = reminders.filter(
    (r) => r.status === "pending" && r.scheduledDate <= new Date().toISOString().split("T")[0]
  ).length;

  const handleProcessDue = async () => {
    setIsProcessing(true);
    setBatchResult(null);

    const res = await triggerDueRemindersBatch();
    if ("error" in res && res.error) {
      setBatchResult(`Error: ${res.error}`);
    } else if ("sent" in res && "total" in res && "failed" in res) {
      setBatchResult(`Processed ${res.total} reminders: ${res.sent} sent successfully, ${res.failed} failed.`);
      // Refresh local list
      setReminders((prev) =>
        prev.map((r) => {
          if (r.status === "pending" && r.scheduledDate <= new Date().toISOString().split("T")[0]) {
            return { ...r, status: "sent", sentAt: new Date() };
          }
          return r;
        })
      );
    }
    setIsProcessing(false);
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this scheduled reminder?")) return;
    const res = await cancelReminder(id);
    if (res.success) {
      setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, status: "cancelled" } : r)));
    }
  };

  const handleCreateReminder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setModalPending(true);
    setModalError(null);

    const formData = new FormData(e.currentTarget);
    const res = await createManualReminder(formData);

    if (res.error) {
      setModalError(res.error);
    } else if (res.reminder) {
      setReminders([
        {
          ...res.reminder,
          medicineName: medicines.find((m) => m.id === res.reminder.medicineId)?.name || null,
        },
        ...reminders,
      ]);
      setShowModal(false);
    }
    setModalPending(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Due Trigger */}
      <div className="card p-5 bg-gradient-to-r from-primary-50/50 to-emerald-50/50 border border-primary-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-ink-900">
              {dueCount > 0 ? `${dueCount} Patient Reminders Due Today` : "All Scheduled Reminders Up-to-date"}
            </h3>
            <p className="text-xs text-ink-500">
              Automatically triggers WhatsApp and SMS reminders for medicine refills, doctor visits, and outstanding dues.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="btn btn-secondary btn-sm"
          >
            <Plus className="h-4 w-4" /> Schedule Reminder
          </button>
          <button
            type="button"
            onClick={handleProcessDue}
            disabled={isProcessing || dueCount === 0}
            className="btn btn-primary btn-sm"
          >
            {isProcessing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span>Dispatch Due ({dueCount})</span>
          </button>
        </div>
      </div>

      {batchResult && (
        <div
          className={clsx(
            "text-xs p-3 rounded-lg border",
            batchResult.startsWith("Error")
              ? "bg-rose-50 border-rose-200 text-rose-700"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          )}
        >
          {batchResult}
        </div>
      )}

      {/* Filters and search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {["all", "pending", "sent", "failed", "cancelled"].map((st) => (
            <button
              key={st}
              onClick={() => setFilter(st)}
              className={clsx(
                "btn btn-sm capitalize",
                filter === st ? "btn-primary" : "btn-ghost"
              )}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <input
            type="text"
            placeholder="Search patient, medicine…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input input-sm pl-9 w-full"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Medicine / Reason</th>
                <th>Scheduled Date</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Message Preview</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-ink-400">
                    No reminders found matching the selected filter.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="font-medium text-ink-900 text-[13px]">{r.customerName}</div>
                      <div className="text-[11.5px] text-ink-500 font-mono flex items-center gap-1">
                        <Phone className="h-3 w-3" /> +{r.customerPhone}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 text-[13px] text-ink-800 font-medium">
                        <Pill className="h-3.5 w-3.5 text-primary-500" />
                        {r.medicineName || (
                          <span className="capitalize">{r.type} Alert</span>
                        )}
                      </div>
                      <span className="badge badge-neutral text-[10.5px] capitalize mt-0.5">{r.type}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1 text-[12.5px] text-ink-700 font-mono">
                        <Calendar className="h-3.5 w-3.5 text-ink-400" />
                        {r.scheduledDate}
                      </div>
                    </td>
                    <td>
                      <span className="font-mono text-xs uppercase px-2 py-0.5 rounded bg-ink-100 text-ink-700">
                        {r.channel}
                      </span>
                    </td>
                    <td>
                      <span
                        className={clsx(
                          "badge text-[11px]",
                          r.status === "sent"
                            ? "badge-success"
                            : r.status === "pending"
                            ? "badge-warning"
                            : r.status === "failed"
                            ? "badge-danger"
                            : "badge-neutral"
                        )}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="max-w-xs truncate text-xs text-ink-500" title={r.message}>
                      {r.message}
                    </td>
                    <td className="text-right">
                      {r.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => handleCancel(r.id)}
                          className="btn btn-ghost btn-xs text-rose-600 hover:bg-rose-50"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-ink-150 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-ink-150 bg-ink-50 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-ink-900">Schedule Patient Reminder</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-ink-400 hover:text-ink-700 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateReminder} className="p-5 space-y-4">
              {modalError && (
                <div className="alert-error text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {modalError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-700">Patient Name</label>
                  <input
                    type="text"
                    name="customerName"
                    required
                    placeholder="Suresh Kumar"
                    className="input input-sm w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-700">Phone Number *</label>
                  <input
                    type="tel"
                    name="customerPhone"
                    required
                    placeholder="9876543210"
                    className="input input-sm w-full font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-700">Reminder Type</label>
                  <select name="type" className="input input-sm w-full">
                    <option value="refill">Medicine Refill</option>
                    <option value="followup">Doctor Followup</option>
                    <option value="payment">Ledger Payment Due</option>
                    <option value="custom">General Custom</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-700">Scheduled Date *</label>
                  <input
                    type="date"
                    name="scheduledDate"
                    required
                    defaultValue={new Date().toISOString().split("T")[0]}
                    className="input input-sm w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-700">Linked Medicine (Optional)</label>
                  <select name="medicineId" className="input input-sm w-full">
                    <option value="">None</option>
                    {medicines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-700">Dispatch Channel</label>
                  <select name="channel" className="input input-sm w-full">
                    <option value="both">WhatsApp & SMS</option>
                    <option value="whatsapp">WhatsApp Only</option>
                    <option value="sms">SMS Only</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">Message Text *</label>
                <textarea
                  name="message"
                  required
                  rows={3}
                  placeholder="Dear Customer, your medicine course is due for refill. Reply YES to order."
                  className="input input-sm w-full py-2"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-ink-150">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalPending}
                  className="btn btn-primary btn-sm"
                >
                  <Bell className="h-4 w-4" /> {modalPending ? "Scheduling…" : "Save Reminder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
