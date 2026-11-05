"use client";

import { useState } from "react";
import { formatINR } from "@/lib/format";
import { MessageSquare, Send, CheckCircle2, AlertCircle, X } from "lucide-react";
import type { CustomerExposure } from "@/server/domain/receivables";
import { sendPaymentReminderAction } from "@/app/actions/receivables";

interface PaymentReminderModalProps {
  customer: CustomerExposure | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PaymentReminderModal({
  customer,
  isOpen,
  onClose,
  onSuccess,
}: PaymentReminderModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const defaultMessage = customer
    ? `Dear ${customer.customerName}, this is a friendly payment reminder from your pharmacy. You have an outstanding balance of ${formatINR(customer.netExposure)} across ${customer.openInvoices?.length ?? 0} bill(s). Please clear the dues at your earliest convenience. Thank you!`
    : "";

  const [message, setMessage] = useState(defaultMessage);

  if (!isOpen || !customer) return null;

  const handleSend = async () => {
    if (!customer.phone) {
      setError("Customer does not have a phone number registered.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const res = await sendPaymentReminderAction({
      customerId: customer.customerId,
      phone: customer.phone,
      message,
    });

    setIsSubmitting(false);

    if (res.success) {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
        onSuccess?.();
      }, 1500);
    } else {
      setError(res.error || "Failed to enqueue reminder");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Send Payment Reminder"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/40 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-ink-150 bg-white p-6 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-ink-150">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink-900 leading-none">
                Send Payment Reminder
              </h2>
              <p className="text-xs text-ink-500 mt-1">
                Dispatch WhatsApp notification via transactional outbox
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 py-3">
          <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-neutral-500">Recipient:</span>
              <span className="font-medium text-neutral-800">{customer.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Phone:</span>
              <span className="font-mono text-neutral-800">{customer.phone || "No phone"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Total Outstanding:</span>
              <span className="font-semibold text-rose-600">{formatINR(customer.netExposure)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Max Overdue:</span>
              <span className="font-medium text-amber-600">{customer.maxDaysOverdue} days</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              WhatsApp Message Preview
            </label>
            <textarea
              value={message}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-neutral-200 p-2 text-xs font-sans text-neutral-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              disabled={isSubmitting || success}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 p-2.5 rounded border border-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Reminder queued in transactional outbox for immediate delivery!</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-ink-150">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={isSubmitting || success || !customer.phone}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {isSubmitting ? "Queueing..." : "Send Reminder"}
          </button>
        </div>
      </div>
    </div>
  );
}
