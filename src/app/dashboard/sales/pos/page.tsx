"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Volume2, VolumeX, BookmarkCheck, Layers, RotateCcw, Lock, Unlock, AlertTriangle } from "lucide-react";
import { defaultPosDataSource as ds } from "./_data/posData";
import { usePosCart } from "./_state/usePosCart";
import { usePosShortcuts } from "./_state/usePosShortcuts";
import { SearchBar } from "./_components/SearchBar";
import { CartTable } from "./_components/CartTable";
import { CustomerPicker } from "./_components/CustomerPicker";
import { CompliancePanel } from "./_components/CompliancePanel";
import { PaymentPanel } from "./_components/PaymentPanel";
import { TotalsBar } from "./_components/TotalsBar";
import { SubstitutesModal } from "./_components/SubstitutesModal";
import { PromiseOrderModal } from "./_components/PromiseOrderModal";
import { HeldBillsModal } from "./_components/HeldBillsModal";
import type { CurrentShiftStats } from "@/server/domain/cash-sessions";

export default function POSPage() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { state, dispatch, totals, loyaltyDiscountPaise, rxWarning, controlledItems, playSound } = usePosCart();

  const [activeShift, setActiveShift] = useState<CurrentShiftStats | null>(null);
  const [requireShift, setRequireShift] = useState(false);
  const [heldCount, setHeldCount] = useState(0);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isParkOpen, setIsParkOpen] = useState(false);
  const [isHeldListOpen, setIsHeldListOpen] = useState(false);
  const [substituteGeneric, setSubstituteGeneric] = useState<string | null>(null);
  const [promiseMedicine, setPromiseMedicine] = useState<{ id: string; name: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [revalidationAlert, setRevalidationAlert] = useState<{ hasIssues: boolean; hasStockShortage: boolean; hasExpiredBatches: boolean; message: string } | null>(null);

  const refreshMeta = useCallback(async () => {
    try {
      const [shift, held] = await Promise.all([ds.getShiftStatus(), ds.listHeldSales()]);
      if (shift) {
        setActiveShift(shift.activeShift);
        setRequireShift(shift.requireShift);
      }
      setHeldCount(held.count);
    } catch (e) {
      console.error("Meta refresh error:", e);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => refreshMeta());
    searchInputRef.current?.focus();
  }, [refreshMeta]);

  const handleCompleteSale = async (method = state.paymentMethod) => {
    if (state.cart.length === 0 || isSubmitting) return;
    if (requireShift && !activeShift) {
      alert("Please open a cash register shift before completing sales.");
      return;
    }
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const paymentsInput = method === "split" ? [
        { method: "cash" as const, amount: Math.round((parseFloat(state.splitPayments.cash) || 0) * 100) },
        { method: "upi" as const, amount: Math.round((parseFloat(state.splitPayments.upi) || 0) * 100) },
        { method: "card" as const, amount: Math.round((parseFloat(state.splitPayments.card) || 0) * 100) },
      ].filter((p) => p.amount > 0) : undefined;

      const res = await ds.createSale({
        customerId: state.customer?.id,
        doctorName: state.compliance.doctorName,
        items: state.cart.map((c) => ({
          batchId: c.batchId,
          medicineId: c.medicineId,
          qty: c.qty,
          packQty: c.packQty,
          looseQty: c.looseQty,
          rate: c.saleRate ?? c.mrp,
          discountBp: c.discountBp,
          autoFefo: c.autoFefo,
          overrideBatch: c.overrideBatch,
          overrideReason: c.overrideReason,
        })),
        paymentMethod: method === "split" ? "cash" : method,
        amountPaid: totals.total,
        complianceDetails: {
          doctorName: state.compliance.doctorName,
          doctorRegNo: state.compliance.doctorRegNo,
          doctorAddress: state.compliance.doctorAddress,
          patientAge: state.compliance.patientAge === "" ? undefined : Number(state.compliance.patientAge),
          patientGender: state.compliance.patientGender,
          patientAddress: state.compliance.patientAddress,
          prescriptionRef: state.compliance.prescriptionRef,
          prescriptionDate: state.compliance.prescriptionDate,
        },
        medicalRepId: state.compliance.medicalRepId,
        paymentsInput,
        heldSaleId: state.resumedHeldId || undefined,
        redeemPoints: state.redeemPoints,
      });

      if (res.saleId) {
        playSound("chime");
        dispatch({ type: "RESET_SALE" });
        setIsPaymentOpen(false);
        router.push(`/dashboard/sales/${res.saleId}/print?format=thermal`);
      } else {
        setSubmitError(res.error || "Failed to finalize sale");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  usePosShortcuts({
    onFocusSearch: () => searchInputRef.current?.focus(),
    onResetSale: () => {
      dispatch({ type: "RESET_SALE" });
      searchInputRef.current?.focus();
    },
    onOpenSubstitutes: () => {
      const itemWithGen = state.cart.find((c) => c.genericName);
      if (itemWithGen?.genericName) setSubstituteGeneric(itemWithGen.genericName);
    },
    onOpenRegister: () => router.push("/dashboard/sales/register"),
    onHoldBill: () => { if (state.cart.length > 0) setIsParkOpen(true); },
    onListHeldBills: () => setIsHeldListOpen(true),
    onOpenPaymentModal: () => setIsPaymentOpen(true),
    onOpenPromiseModal: () => setPromiseMedicine({ id: "", name: "" }),
    onCompleteSale: () => handleCompleteSale(isPaymentOpen ? "split" : state.paymentMethod),
    onEscape: () => {
      setIsPaymentOpen(false);
      setIsParkOpen(false);
      setIsHeldListOpen(false);
      setSubstituteGeneric(null);
      setPromiseMedicine(null);
    },
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] p-4 gap-4 overflow-hidden bg-ink-50/50">
      <div className="flex-1 flex flex-col space-y-3 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/sales" className="btn btn-secondary btn-icon" title="Back to Sales"><ArrowLeft className="h-4 w-4" /></Link>
            <h1 className="text-lg font-bold text-ink-900 flex items-center gap-2">POS Billing Counter <span className="badge badge-brand !text-[11px] font-mono">F2 New Bill</span></h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => dispatch({ type: "SET_SOUND_ENABLED", payload: !state.soundEnabled })} className="btn btn-secondary btn-icon" title="Toggle audio">{state.soundEnabled ? <Volume2 className="h-4 w-4 text-brand-600" /> : <VolumeX className="h-4 w-4 text-ink-400" />}</button>
            <button type="button" onClick={() => setIsParkOpen(true)} disabled={state.cart.length === 0} className="btn btn-secondary text-xs" title="Park current bill (F6)"><BookmarkCheck className="h-3.5 w-3.5 mr-1 text-amber-600" /> Hold (F6)</button>
            <button type="button" onClick={() => setIsHeldListOpen(true)} className="btn btn-secondary text-xs relative" title="View parked bills (F7)"><Layers className="h-3.5 w-3.5 mr-1 text-brand-600" /> Parked ({heldCount}) [F7]</button>
            <button type="button" onClick={() => { dispatch({ type: "RESET_SALE" }); searchInputRef.current?.focus(); }} className="btn btn-secondary text-xs" title="New bill (F2)"><RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear (F2)</button>
            <Link href="/dashboard/sales/register" className={`btn btn-secondary text-xs flex items-center gap-1.5 ${activeShift ? "text-emerald-700 bg-emerald-50" : requireShift ? "text-amber-800 bg-amber-50 font-bold" : "text-ink-600"}`}>{activeShift ? <><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Register Open</> : <><Lock className="h-3.5 w-3.5 text-amber-600" /> Register Closed</>}</Link>
          </div>
        </div>

        {requireShift && !activeShift && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-amber-900 text-xs shadow-xs">
            <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" /><span><strong>Open register to start billing:</strong> A cash register shift is required for this store.</span></div>
            <Link href="/dashboard/sales/register" className="btn btn-primary bg-amber-600 hover:bg-amber-700 text-white text-xs py-1 px-3 flex items-center gap-1.5 font-bold"><Unlock className="w-3.5 h-3.5" /> Open Register (F4)</Link>
          </div>
        )}

        <SearchBar inputRef={searchInputRef} dataSource={ds} onSelectBatch={(m, b, all) => dispatch({ type: "ADD_LINE", payload: { medicine: m, batch: b, allBatches: all } })} onOpenSubstitutes={(gen) => setSubstituteGeneric(gen)} onOpenPromiseOrder={(med) => setPromiseMedicine(med)} playSound={playSound} />
        <CartTable cart={state.cart} revalidationAlert={revalidationAlert} rxWarning={rxWarning} controlledItems={controlledItems} onUpdatePackQty={(batchId, pQty) => dispatch({ type: "UPDATE_LINE_PACK_QTY", payload: { batchId, packQty: pQty } })} onUpdateLooseQty={(batchId, lQty) => dispatch({ type: "UPDATE_LINE_LOOSE_QTY", payload: { batchId, looseQty: lQty } })} onUpdateDiscount={(batchId, dBp) => dispatch({ type: "UPDATE_LINE_DISCOUNT", payload: { batchId, discountBp: dBp } })} onUpdateBatch={(oldId, newB, reason) => dispatch({ type: "UPDATE_LINE_BATCH", payload: { oldBatchId: oldId, newBatch: newB, reason } })} onRemoveLine={(batchId) => dispatch({ type: "REMOVE_LINE", payload: { batchId } })} onOpenSubstitutes={(gen) => setSubstituteGeneric(gen)} />
      </div>

      <div className="w-80 flex flex-col space-y-3 shrink-0">
        <CustomerPicker customer={state.customer} dataSource={ds} onSelectCustomer={(c) => dispatch({ type: "SET_CUSTOMER", payload: c })} onCustomerRedeemableLoaded={(pts, val) => dispatch({ type: "SET_CUSTOMER_REDEEMABLE", payload: { redeemablePoints: pts, redeemableValuePaise: val } })} />
        <CompliancePanel compliance={state.compliance} hasControlledItems={controlledItems.length > 0} dataSource={ds} onChange={(patch) => dispatch({ type: "SET_COMPLIANCE", payload: patch })} />
        <TotalsBar totals={totals} loyaltyDiscountPaise={loyaltyDiscountPaise} itemCount={state.cart.length} paymentMethod={state.paymentMethod} isSubmitting={isSubmitting} canBill={!requireShift || Boolean(activeShift)} onSetPaymentMethod={(m) => dispatch({ type: "SET_PAYMENT_METHOD", payload: m })} onOpenSplitModal={() => setIsPaymentOpen(true)} onCompleteSale={() => handleCompleteSale()} />
      </div>

      <PaymentPanel isOpen={isPaymentOpen} totalPaise={totals.total} splitPayments={state.splitPayments} customer={state.customer} redeemPoints={state.redeemPoints} isSubmitting={isSubmitting} errorMsg={submitError} onUpdateSplit={(p) => dispatch({ type: "SET_SPLIT_PAYMENTS", payload: p })} onUpdateRedeemPoints={(pts) => dispatch({ type: "SET_REDEEM_POINTS", payload: pts })} onSubmit={() => handleCompleteSale("split")} onClose={() => setIsPaymentOpen(false)} />
      <HeldBillsModal
        isListOpen={isHeldListOpen}
        isParkOpen={isParkOpen}
        itemCount={state.cart.length}
        dataSource={ds}
        onHoldBill={async (notes) => {
          await ds.holdSale({
            customerId: state.customer?.id,
            customerName: state.customer?.name,
            customerPhone: state.customer?.phone,
            doctorName: state.compliance.doctorName || undefined,
            notes,
            items: state.cart.map((c) => ({
              batchId: c.batchId,
              medicineId: c.medicineId,
              medicineName: c.medicineName,
              batchNo: c.batchNo,
              expiryDate: c.expiryDate,
              packQty: c.packQty,
              looseQty: c.looseQty,
              unitsPerPack: c.unitsPerPack,
              packUnit: c.packUnit,
              looseUnit: c.looseUnit,
              rate: c.saleRate ?? c.mrp,
              mrp: c.mrp,
              discountBp: c.discountBp,
              gstRateBp: c.gstRateBp,
            })),
          });
          dispatch({ type: "RESET_SALE" });
          refreshMeta();
        }}
        onResumeBill={async (id) => {
          const res = await ds.resumeHeldSale(id);
          if (res.success) {
            const lines = res.payload.items.map((it) => {
              const upp = it.unitsPerPack || 1;
              const packQty = it.packQty || 0;
              const looseQty = it.looseQty || 0;
              return {
                batchId: it.batchId,
                medicineId: it.medicineId,
                medicineName: it.medicineName,
                genericName: it.genericName,
                batchNo: it.batchNo,
                expiryDate: it.expiryDate,
                qty: packQty * upp + looseQty,
                packQty,
                looseQty,
                unitsPerPack: upp,
                packUnit: it.packUnit || "strip",
                looseUnit: it.looseUnit || "tablet",
                qtyOnHand: 0,
                mrp: it.mrp,
                saleRate: it.rate,
                discountBp: it.discountBp || 0,
                gstRateBp: it.gstRateBp,
                autoFefo: Boolean(it.isAutoFefo),
              };
            });
            dispatch({
              type: "HYDRATE_HELD_SALE",
              payload: { heldSaleId: id, lines, doctorName: res.payload.doctorName || undefined },
            });
            if (res.revalidation?.hasIssues) {
              const issues: string[] = [];
              if (res.revalidation.hasExpiredBatches) issues.push("Some batches expired while parked!");
              if (res.revalidation.hasStockShortage) issues.push("Some batches have insufficient stock!");
              setRevalidationAlert({
                hasIssues: true,
                hasStockShortage: res.revalidation.hasStockShortage,
                hasExpiredBatches: res.revalidation.hasExpiredBatches,
                message: issues.join(" "),
              });
            } else {
              setRevalidationAlert(null);
            }
            refreshMeta();
          }
        }}
        onClose={() => {
          setIsParkOpen(false);
          setIsHeldListOpen(false);
        }}
      />
      <SubstitutesModal isOpen={Boolean(substituteGeneric)} genericName={substituteGeneric || ""} dataSource={ds} onSelectSubstitute={(m, b, all) => dispatch({ type: "ADD_LINE", payload: { medicine: m, batch: b, allBatches: all } })} onClose={() => setSubstituteGeneric(null)} />
      <PromiseOrderModal isOpen={Boolean(promiseMedicine)} medicine={promiseMedicine} defaultCustomerName={state.customer?.name} defaultCustomerPhone={state.customer?.phone || ""} dataSource={ds} onSuccess={() => refreshMeta()} onClose={() => setPromiseMedicine(null)} />
    </div>
  );
}
