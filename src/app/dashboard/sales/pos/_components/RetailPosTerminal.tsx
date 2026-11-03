"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePosDataSource } from "@/offline/usePosDataSource";
import { PendingBillsDrawer } from "./PendingBillsDrawer";
import { OfflineReceiptModal } from "./OfflineReceiptModal";
import { getPosDB } from "@/offline/db";
import type { OfflinePendingSale } from "@/offline/types";
import { usePosCart } from "../_state/usePosCart";
import { usePosShortcuts } from "../_state/usePosShortcuts";
import { useShell } from "@/app/components/ShellContext";
import { PosHeader } from "./PosHeader";
import { SearchBar } from "./SearchBar";
import { CartTable } from "./CartTable";
import { CustomerPicker } from "./CustomerPicker";
import { CompliancePanel } from "./CompliancePanel";
import { TotalsBar } from "./TotalsBar";
import { PosModals } from "./PosModals";
import { MobileTenderBar } from "./MobileTenderBar";
import type { CurrentShiftStats } from "@/server/domain/cash-sessions";

export function RetailPosTerminal() {
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

  const posDs = usePosDataSource({
    storeId: currentStore?.id,
  });
  const ds = posDs.dataSource;

  const [activeShift, setActiveShift] = useState<CurrentShiftStats | null>(null);
  const [requireShift, setRequireShift] = useState(false);
  const [heldCount, setHeldCount] = useState(0);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isParkOpen, setIsParkOpen] = useState(false);
  const [isHeldListOpen, setIsHeldListOpen] = useState(false);
  const [isPendingDrawerOpen, setIsPendingDrawerOpen] = useState(false);
  const [offlineReceiptBill, setOfflineReceiptBill] = useState<OfflinePendingSale | null>(null);
  const [substituteGeneric, setSubstituteGeneric] = useState<string | null>(null);
  const [promiseMedicine, setPromiseMedicine] = useState<{ id: string; name: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [revalidationAlert, setRevalidationAlert] = useState<{
    hasIssues: boolean;
    hasStockShortage: boolean;
    hasExpiredBatches: boolean;
    message: string;
  } | null>(null);

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
  }, [ds]);

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
        if (posDs.isOffline) {
          const bill = await getPosDB().pendingSales.get(res.saleId);
          if (bill) setOfflineReceiptBill(bill);
        } else {
          router.push(`/dashboard/sales/${res.saleId}/print?format=thermal`);
        }
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
          isOffline={posDs.isOffline}
          isSyncing={posDs.isSyncing}
          pendingCount={posDs.pendingCount}
          lastSyncAt={posDs.lastSyncAt}
          onOpenPendingDrawer={() => setIsPendingDrawerOpen(true)}
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

      <MobileTenderBar
        itemCount={state.cart.length}
        totalPaise={totals.total}
        isSubmitting={isSubmitting}
        canBill={!requireShift || Boolean(activeShift)}
        onHold={() => setIsParkOpen(true)}
        onOpenPayment={() => setIsPaymentOpen(true)}
      />

      <PosModals
        isPaymentOpen={isPaymentOpen}
        isParkOpen={isParkOpen}
        isHeldListOpen={isHeldListOpen}
        substituteGeneric={substituteGeneric}
        promiseMedicine={promiseMedicine}
        totals={totals}
        state={state}
        dispatch={dispatch}
        isSubmitting={isSubmitting}
        submitError={submitError}
        isOffline={posDs.isOffline}
        dataSource={ds}
        refreshMeta={refreshMeta}
        setRevalidationAlert={setRevalidationAlert}
        onCompleteSplitSale={() => handleCompleteSale("split")}
        onClosePayment={() => setIsPaymentOpen(false)}
        onCloseHeld={() => {
          setIsParkOpen(false);
          setIsHeldListOpen(false);
        }}
        onCloseSubstitute={() => setSubstituteGeneric(null)}
        onClosePromise={() => setPromiseMedicine(null)}
      />

      <PendingBillsDrawer
        isOpen={isPendingDrawerOpen}
        onClose={() => setIsPendingDrawerOpen(false)}
        storeId={currentStore?.id || ""}
        storeCode={currentStore?.code || ""}
        isOffline={posDs.isOffline}
        isSyncing={posDs.isSyncing}
        onTriggerSync={posDs.triggerSyncNow}
        onReprintBill={(b) => setOfflineReceiptBill(b)}
      />

      <OfflineReceiptModal
        isOpen={Boolean(offlineReceiptBill)}
        onClose={() => setOfflineReceiptBill(null)}
        bill={offlineReceiptBill}
        storeName={currentStore?.name}
        storeCode={currentStore?.code}
      />
    </div>
  );
}
