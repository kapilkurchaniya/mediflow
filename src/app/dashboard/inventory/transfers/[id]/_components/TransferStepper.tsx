"use client";

import { format } from "date-fns";
import { CheckCircle2, Clock, Truck, XCircle } from "lucide-react";

interface TransferStepperProps {
  status: string;
  fromStoreName?: string;
  toStoreName?: string;
  dispatchedAt?: string | Date | null;
  receivedAt?: string | Date | null;
  vehicleNo?: string | null;
}

export function TransferStepper({
  status,
  fromStoreName,
  toStoreName,
  dispatchedAt,
  receivedAt,
  vehicleNo,
}: TransferStepperProps) {
  const isDraft = status === "draft";
  const isInTransit = status === "dispatched" || status === "partially_received";
  const isComplete = status === "received";
  const isCancelled = status === "cancelled";

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-xs">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${isDraft || isInTransit || isComplete ? "bg-brand-50 text-brand-600" : "bg-ink-100 text-ink-400"}`}>
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-ink-900">1. Draft Created</p>
            <p className="text-[11px] text-ink-500">{fromStoreName}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${isInTransit || isComplete ? "bg-blue-50 text-blue-600" : "bg-ink-100 text-ink-400"}`}>
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-ink-900">2. Dispatched (In Transit)</p>
            <p className="text-[11px] text-ink-500">
              {dispatchedAt ? format(new Date(dispatchedAt), "dd MMM, hh:mm a") : "Pending dispatch"}
            </p>
            {vehicleNo && <p className="text-[10px] text-ink-400 font-mono">Veh: {vehicleNo}</p>}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${isComplete ? "bg-emerald-50 text-emerald-600" : isCancelled ? "bg-rose-50 text-rose-600" : "bg-ink-100 text-ink-400"}`}>
            {isCancelled ? <XCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-xs font-semibold text-ink-900">
              {isCancelled ? "Cancelled" : isComplete ? "3. Received" : "3. Destination Receipt"}
            </p>
            <p className="text-[11px] text-ink-500">
              {receivedAt ? format(new Date(receivedAt), "dd MMM, hh:mm a") : toStoreName}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
