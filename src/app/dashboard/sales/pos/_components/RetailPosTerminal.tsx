"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { clearPosSearchCache } from "../_data/posData";
import { usePosDataSource } from "@/offline/usePosDataSource";
import { PendingBillsDrawer } from "./PendingBillsDrawer";
import { OfflineReceiptModal } from "./OfflineReceiptModal";
import { getPosDB } from "@/offline/db";
import type { OfflinePendingSale } from "@/offline/types";
import { usePosCart } from "../_state/usePosCart";
import { usePosShortcuts } from "../_state/usePosShortcuts";
import { usePosBarcodeBridge } from "../_hooks/usePosBarcodeBridge";
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
  const { toggleCalculator, setShortcutsOpen, calculatorOpen, shortcutsOpen, currentStore, setStoreSwitcherOpen, collapsed, toggleCollapsed, userId, tenantId } = useShell();
  const cartIdentity = useMemo(() => ({ tenantId, storeId: currentStore?.id, userId }), [tenantId, currentStore?.id, userId]);
  const { state, dispatch, totals, loyaltyDiscountPaise, rxWarning, controlledItems, playSound } = usePosCart(cartIdentity);

  const posDs = usePosDataSource({ storeId: currentStore?.id, cashierId: userId });
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
  const [complianceForceOpen, setComplianceForceOpen] = useState(false);

  const requiresStrictRegAndAddress = useMemo(
    () =>
      controlledItems.some(
        (i) => i.schedule && ["X", "NARCOTIC"].includes(i.schedule.toUpperCase())
      ),
    [controlledItems]
  );

  const validatePosComplianceBeforeCheckout = useCallback((): string | null => {
    if (controlledItems.length === 0) return null;
    const missing: string[] = [];
    if (!state.compliance.doctorName.trim()) missing.push("Doctor Name");
    if (!state.compliance.prescriptionRef.trim()) missing.push("Prescription Ref / Rx No");
    if (requiresStrictRegAndAddress) {
      if (!state.compliance.doctorRegNo.trim()) missing.push("Doctor Reg. No");
      if (!state.compliance.patientAddress.trim()) missing.push("Patient Address");
    }
    if (missing.length === 0) return null;
    return `Prescription required for ${controlledItems.map((i) => i.medicineName).join(", ")}. Please enter: ${missing.join(", ")} in Doctor & Prescription.`;
  }, [controlledItems, state.compliance, requiresStrictRegAndAddress]);

  const hasStockShortage = useMemo(() => {
    return state.cart.some((line) => {
      const upp = Math.max(1, line.unitsPerPack ?? 1);
      const requested = line.packQty * upp + line.looseQty;
      const available = line.autoFefo ? (line.totalAvailableStock ?? line.qtyOnHand) : line.qtyOnHand;
      return requested > available;
    });
  }, [state.cart]);

  const handleSafeResetSale = useCallback(() => {
    if (state.cart.length > 0 && !window.confirm("Clear current bill? All items in the cart will be removed.")) {
      return;
    }
    dispatch({ type: "RESET_SALE" });
    setSubmitError("");
    searchInputRef.current?.focus();
  }, [state.cart.length, dispatch]);
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

  useEffect(() => {
    const onStoreSwitch = () => {
      clearPosSearchCache();
      dispatch({ type: "RESET_SALE" });
      void refreshMeta();
    };
    window.addEventListener("mediflow:store-switch", onStoreSwitch);
    return () => window.removeEventListener("mediflow:store-switch", onStoreSwitch);
  }, [dispatch, refreshMeta]);

  useEffect(() => {
    const onAiAddToBill = async (ev: Event) => {
      const detail = (ev as CustomEvent<{ medicineName?: string }>).detail;
      const query = detail?.medicineName?.trim();
      if (!query) return;
      try {
        const results = await ds.searchItems(query);
        const match = results.find((r) => r.batches && r.batches.length > 0);
        if (match && match.batches[0]) {
          dispatch({
            type: "ADD_LINE",
            payload: { medicine: match.medicine, batch: match.batches[0], allBatches: match.batches },
          });
          playSound("beep");
        } else {
          setSubmitError(`Could not add "${query}" from AI Copilot: out of stock or not found.`);
        }
      } catch (err) {
        console.error("AI add-to-bill failed:", err);
      }
    };
    window.addEventListener("ai-add-to-bill", onAiAddToBill);
    return () => window.removeEventListener("ai-add-to-bill", onAiAddToBill);
  }, [ds, dispatch, playSound]);

  const handleCompleteSale = async (method = state.paymentMethod) => {
    if (state.cart.length === 0 || isSubmitting) return;
    if (hasStockShortage) {
      setSubmitError("One or more items exceed available stock. Adjust quantities or choose a substitute first.");
      return;
    }
    const complianceErr = validatePosComplianceBeforeCheckout();
    if (complianceErr) {
      setComplianceForceOpen(true);
      setSubmitError(complianceErr);
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
          batchId: c.batchId, medicineId: c.medicineId, qty: c.qty, packQty: c.packQty, looseQty: c.looseQty,
          rate: c.saleRate ?? c.mrp, discountBp: c.discountBp, autoFefo: c.autoFefo,
          overrideBatch: c.overrideBatch, overrideReason: c.overrideReason,
        })),
        paymentMethod: method === "split" ? "cash" : method,
        amountPaid: totals.total,
        complianceDetails: {
          doctorId: state.compliance.doctorId || undefined,
          doctorName: state.compliance.doctorName,
          doctorRegNo: state.compliance.doctorRegNo,
          doctorAddress: state.compliance.doctorAddress,
          patientName: state.compliance.patientName || state.customer?.name || undefined,
          patientPhone: state.customer?.phone || undefined,
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
          router.push(`/dashboard/sales/${res.saleId}/print`);
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
    onResetSale: handleSafeResetSale,
    onOpenSubstitutes: () => {
      const item = state.cart.find((c) => c.genericName);
      if (item?.genericName) setSubstituteGeneric(item.genericName);
    },
    onOpenRegister: () => router.push("/dashboard/sales/register"),
    onHoldBill: () => { if (state.cart.length > 0) setIsParkOpen(true); },
    onListHeldBills: () => setIsHeldListOpen(true),
    onOpenPaymentModal: () => {
      const complianceErr = validatePosComplianceBeforeCheckout();
      if (complianceErr) {
        setComplianceForceOpen(true);
        setSubmitError(complianceErr);
        return;
      }
      setIsPaymentOpen(true);
    },
    onOpenPromiseModal: () => setPromiseMedicine({ id: "", name: "" }),
    onCompleteSale: () => handleCompleteSale(isPaymentOpen ? "split" : state.paymentMethod),
    onOpenCalculator: () => toggleCalculator(),
    onOpenShortcutsCheatSheet: () => setShortcutsOpen(true),
    onEscape: () => {
      setIsPaymentOpen(false); setIsParkOpen(false); setIsHeldListOpen(false);
      setSubstituteGeneric(null); setPromiseMedicine(null);
    },
    isModalOpen: isPaymentOpen || isParkOpen || isHeldListOpen || shortcutsOpen || calculatorOpen || Boolean(substituteGeneric) || Boolean(promiseMedicine),
    allowCompleteSaleInModal: isPaymentOpen && !isParkOpen && !isHeldListOpen && !shortcutsOpen && !calculatorOpen && !substituteGeneric && !promiseMedicine,
  });

  usePosBarcodeBridge({
    dataSource: ds,
    onSelectBatch: (m, b, all) => dispatch({ type: "ADD_LINE", payload: { medicine: m, batch: b, allBatches: all } }),
    playSound,
    onBarcodeMiss: (barcode) => {
      searchInputRef.current?.focus();
      window.dispatchEvent(new CustomEvent("pos-barcode-miss", { detail: barcode }));
    },
  });

  return (
    <div className="flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-3.5rem)] p-3 lg:p-4 gap-4 overflow-y-auto lg:overflow-hidden pb-24 lg:pb-4 bg-ink-50/50">
      <div className="flex-1 flex flex-col space-y-3 min-w-0">
        <PosHeader
          currentStore={currentStore}
          onOpenStoreSwitcher={() => setStoreSwitcherOpen(true)}
          sidebarCollapsed={collapsed}
          onToggleSidebar={toggleCollapsed}
          soundEnabled={state.soundEnabled}
          onToggleSound={() => dispatch({ type: "SET_SOUND_ENABLED", payload: !state.soundEnabled })}
          cartLength={state.cart.length}
          onHoldBill={() => { if (state.cart.length > 0) setIsParkOpen(true); }}
          heldCount={heldCount}
          onOpenHeldBills={() => setIsHeldListOpen(true)}
          onResetSale={handleSafeResetSale}
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
          onSelectBatch={(m, b, all) => { setSubmitError(""); dispatch({ type: "ADD_LINE", payload: { medicine: m, batch: b, allBatches: all } }); }}
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
          onUpdatePackQty={(batchId, pQty) => { setSubmitError(""); dispatch({ type: "UPDATE_LINE_PACK_QTY", payload: { batchId, packQty: pQty } }); }}
          onUpdateLooseQty={(batchId, lQty) => { setSubmitError(""); dispatch({ type: "UPDATE_LINE_LOOSE_QTY", payload: { batchId, looseQty: lQty } }); }}
          onUpdateDiscount={(batchId, dBp) => dispatch({ type: "UPDATE_LINE_DISCOUNT", payload: { batchId, discountBp: dBp } })}
          onUpdateBatch={(oldId, newB, reason) => { setSubmitError(""); dispatch({ type: "UPDATE_LINE_BATCH", payload: { oldBatchId: oldId, newBatch: newB, reason } }); }}
          onCapToMax={(batchId, maxUnits) => { setSubmitError(""); dispatch({ type: "CAP_LINE_TO_MAX", payload: { batchId, maxUnits } }); }}
          onRemoveLine={(batchId) => { setSubmitError(""); dispatch({ type: "REMOVE_LINE", payload: { batchId } }); }}
          onOpenSubstitutes={(gen) => setSubstituteGeneric(gen)}
          onFocusSearch={() => searchInputRef.current?.focus()}
        />
      </div>

      <div className="w-full lg:w-80 flex flex-col space-y-3 shrink-0">
        <CustomerPicker customer={state.customer} dataSource={ds} onSelectCustomer={(c) => dispatch({ type: "SET_CUSTOMER", payload: c })} onCustomerRedeemableLoaded={(pts, val) => dispatch({ type: "SET_CUSTOMER_REDEEMABLE", payload: { redeemablePoints: pts, redeemableValuePaise: val } })} />
        <CompliancePanel
          compliance={state.compliance}
          hasControlledItems={controlledItems.length > 0}
          requiresStrictRegAndAddress={requiresStrictRegAndAddress}
          forceOpen={complianceForceOpen}
          dataSource={ds}
          onChange={(patch) => {
            setSubmitError("");
            dispatch({ type: "SET_COMPLIANCE", payload: patch });
          }}
        />
        <TotalsBar
          totals={totals}
          loyaltyDiscountPaise={loyaltyDiscountPaise}
          itemCount={state.cart.length}
          paymentMethod={state.paymentMethod}
          isSubmitting={isSubmitting}
          canBill={!requireShift || Boolean(activeShift)}
          hasStockShortage={hasStockShortage}
          submitError={submitError}
          onDismissError={() => setSubmitError("")}
          onSetPaymentMethod={(m) => dispatch({ type: "SET_PAYMENT_METHOD", payload: m })}
          onOpenSplitModal={() => {
            const complianceErr = validatePosComplianceBeforeCheckout();
            if (complianceErr) {
              setComplianceForceOpen(true);
              setSubmitError(complianceErr);
              return;
            }
            setIsPaymentOpen(true);
          }}
          onCompleteSale={() => handleCompleteSale()}
        />
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
        onCloseHeld={() => { setIsParkOpen(false); setIsHeldListOpen(false); }}
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
