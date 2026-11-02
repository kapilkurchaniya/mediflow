"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { defaultPosDataSource as ds, mapHeldItemsToCartLines } from "./_data/posData";
import { usePosCart } from "./_state/usePosCart";
import { usePosShortcuts } from "./_state/usePosShortcuts";
import { useShell } from "@/app/components/ShellContext";
import { PosHeader } from "./_components/PosHeader";
import { SearchBar } from "./_components/SearchBar";
import { CartTable } from "./_components/CartTable";
import { CustomerPicker } from "./_components/CustomerPicker";
import { CompliancePanel } from "./_components/CompliancePanel";
import { PaymentPanel } from "./_components/PaymentPanel";
import { TotalsBar } from "./_components/TotalsBar";
import { formatINR } from "@/lib/format";
import { SubstitutesModal } from "./_components/SubstitutesModal";
import { PromiseOrderModal } from "./_components/PromiseOrderModal";
import { HeldBillsModal } from "./_components/HeldBillsModal";
import type { CurrentShiftStats } from "@/server/domain/cash-sessions";

export default function POSPage() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { state, dispatch, totals, loyaltyDiscountPaise, rxWarning, controlledItems, playSound } = usePosCart();
  const {
    toggleCalculator,
    setShortcutsOpen,
    calculatorOpen,
    shortcutsOpen,
    currentStore,
    setStoreSwitcherOpen,
  } = useShell();

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

  // Safely clear cart and refresh metadata on store switch
  useEffect(() => {
    const onStoreSwitch = () => {
      dispatch({ type: "RESET_SALE" });
      void refreshMeta();
    };
    window.addEventListener("mediflow:store-switch", onStoreSwitch);
    return () => window.removeEventListener("mediflow:store-switch", onStoreSwitch);
  }, [dispatch, refreshMeta]);

  const handleCompleteSale = async (method = state.paymentMethod) => {
    if (state.cart.length === 0 || isSubmitting) return;
    if (currentStore?.kind === "warehouse") {
      alert("Retail sales are not permitted in warehouse stores. Switch to a retail store.");
      return;
    }
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
    onOpenPaymentModal: () => {
      if (currentStore?.kind === "warehouse") {
        alert("Retail sales are not permitted in warehouse stores. Switch to a retail store.");
        return;
      }
      setIsPaymentOpen(true);
    },
    onOpenPromiseModal: () => setPromiseMedicine({ id: "", name: "" }),
    onCompleteSale: () => handleCompleteSale(isPaymentOpen ? "split" : state.paymentMethod),
    onOpenCalculator: () => toggleCalculator(),
    onOpenShortcutsCheatSheet: () => setShortcutsOpen(true),
    onEscape: () => {
      setIsPaymentOpen(false);
      setIsParkOpen(false);
      setIsHeldListOpen(false);
      setSubstituteGeneric(null);
      setPromiseMedicine(null);
    },
    isModalOpen: isPaymentOpen || isParkOpen || isHeldListOpen || shortcutsOpen || calculatorOpen || Boolean(substituteGeneric) || Boolean(promiseMedicine),
  });

  return (
    <div className="flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-4rem)] p-3 lg:p-4 gap-4 overflow-y-auto lg:overflow-hidden pb-24 lg:pb-4 bg-ink-50/50">
      <div className="flex-1 flex flex-col space-y-3 min-w-0">
        <PosHeader
          currentStore={currentStore}
          onOpenStoreSwitcher={() => setStoreSwitcherOpen(true)}
          soundEnabled={state.soundEnabled}
          onToggleSound={() => dispatch({ type: "SET_SOUND_ENABLED", payload: !state.soundEnabled })}
          cartLength={state.cart.length}
          onHoldBill={() => { if (state.cart.length > 0) setIsParkOpen(true); }}
          heldCount={heldCount}
          onOpenHeldBills={() => setIsHeldListOpen(true)}
          onResetSale={() => { dispatch({ type: "RESET_SALE" }); searchInputRef.current?.focus(); }}
          activeShift={activeShift}
          requireShift={requireShift}
        />

        <SearchBar
          inputRef={searchInputRef}
          dataSource={ds}
          onSelectBatch={(m, b, all) => dispatch({ type: "ADD_LINE", payload: { medicine: m, batch: b, allBatches: all } })}
          onOpenSubstitutes={(gen) => setSubstituteGeneric(gen)}
          onOpenPromiseOrder={(med) => setPromiseMedicine(med)}
          playSound={playSound}
          onEnterCart={() => {
            const firstRow = document.querySelector<HTMLTableRowElement>('tr[data-cart-row="true"]');
            firstRow?.focus();
          }}
        />
        <CartTable
          cart={state.cart}
          revalidationAlert={revalidationAlert}
          rxWarning={rxWarning}
          controlledItems={controlledItems}
          onUpdatePackQty={(batchId, pQty) => dispatch({ type: "UPDATE_LINE_PACK_QTY", payload: { batchId, packQty: pQty } })}
          onUpdateLooseQty={(batchId, lQty) => dispatch({ type: "UPDATE_LINE_LOOSE_QTY", payload: { batchId, looseQty: lQty } })}
          onUpdateDiscount={(batchId, dBp) => dispatch({ type: "UPDATE_LINE_DISCOUNT", payload: { batchId, discountBp: dBp } })}
          onUpdateBatch={(oldId, newB, reason) => dispatch({ type: "UPDATE_LINE_BATCH", payload: { oldBatchId: oldId, newBatch: newB, reason } })}
          onRemoveLine={(batchId) => dispatch({ type: "REMOVE_LINE", payload: { batchId } })}
          onOpenSubstitutes={(gen) => setSubstituteGeneric(gen)}
          onFocusSearch={() => searchInputRef.current?.focus()}
        />
      </div>

      <div className="w-full lg:w-80 flex flex-col space-y-3 shrink-0">
        <CustomerPicker customer={state.customer} dataSource={ds} onSelectCustomer={(c) => dispatch({ type: "SET_CUSTOMER", payload: c })} onCustomerRedeemableLoaded={(pts, val) => dispatch({ type: "SET_CUSTOMER_REDEEMABLE", payload: { redeemablePoints: pts, redeemableValuePaise: val } })} />
        <CompliancePanel compliance={state.compliance} hasControlledItems={controlledItems.length > 0} dataSource={ds} onChange={(patch) => dispatch({ type: "SET_COMPLIANCE", payload: patch })} />
        <TotalsBar totals={totals} loyaltyDiscountPaise={loyaltyDiscountPaise} itemCount={state.cart.length} paymentMethod={state.paymentMethod} isSubmitting={isSubmitting} canBill={!requireShift || Boolean(activeShift)} onSetPaymentMethod={(m) => dispatch({ type: "SET_PAYMENT_METHOD", payload: m })} onOpenSplitModal={() => setIsPaymentOpen(true)} onCompleteSale={() => handleCompleteSale()} />
      </div>

      {/* Mobile & Tablet Fixed Bottom Tender Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-ink-200 px-4 py-3 shadow-pop flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[11px] font-medium text-ink-500 uppercase tracking-wider">
            {state.cart.length} {state.cart.length === 1 ? "item" : "items"}
          </span>
          <span className="text-lg font-bold font-mono text-ink-950">
            {formatINR(totals.total / 100)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {state.cart.length > 0 && (
            <button
              type="button"
              onClick={() => setIsParkOpen(true)}
              className="btn btn-secondary px-3 py-2 text-xs font-semibold"
            >
              Hold
            </button>
          )}
          <button
            type="button"
            disabled={state.cart.length === 0 || isSubmitting || (requireShift && !activeShift)}
            onClick={() => setIsPaymentOpen(true)}
            className="btn btn-primary px-4 py-2 text-xs sm:text-sm font-bold shadow-md active:scale-95 flex items-center gap-1.5"
          >
            {isSubmitting ? "Processing..." : "Tender & Pay (F8)"}
          </button>
        </div>
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
            const lines = mapHeldItemsToCartLines(res.payload.items);
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
