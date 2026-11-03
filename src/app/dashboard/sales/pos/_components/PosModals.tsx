"use client";

import { PaymentPanel } from "./PaymentPanel";
import { HeldBillsModal } from "./HeldBillsModal";
import { SubstitutesModal } from "./SubstitutesModal";
import { PromiseOrderModal } from "./PromiseOrderModal";
import type { PosDataSource } from "../_data/posData";
import { mapHeldItemsToCartLines } from "../_data/posData";
import type { PosState, PosAction, PosCartLine } from "../_state/types";

interface PosModalsProps {
  isPaymentOpen: boolean;
  isParkOpen: boolean;
  isHeldListOpen: boolean;
  substituteGeneric: string | null;
  promiseMedicine: { id: string; name: string } | null;
  totals: { total: number };
  state: PosState;
  dispatch: React.Dispatch<PosAction>;
  isSubmitting: boolean;
  submitError: string;
  isOffline?: boolean;
  dataSource: PosDataSource;
  refreshMeta: () => void;
  setRevalidationAlert: (alert: {
    hasIssues: boolean;
    hasStockShortage: boolean;
    hasExpiredBatches: boolean;
    message: string;
  } | null) => void;
  onCompleteSplitSale: () => void;
  onClosePayment: () => void;
  onCloseHeld: () => void;
  onCloseSubstitute: () => void;
  onClosePromise: () => void;
}

export function PosModals(props: PosModalsProps) {
  const { state, dispatch, dataSource: ds, refreshMeta, setRevalidationAlert } = props;

  const handleHoldBill = async (notes?: string) => {
    await ds.holdSale({
      customerId: state.customer?.id,
      customerName: state.customer?.name,
      customerPhone: state.customer?.phone,
      doctorName: state.compliance.doctorName || undefined,
      notes,
      items: state.cart.map((c: PosCartLine) => ({
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
  };

  const handleResumeBill = async (id: string) => {
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
  };

  return (
    <>
      <PaymentPanel
        isOpen={props.isPaymentOpen}
        totalPaise={props.totals.total}
        splitPayments={state.splitPayments}
        customer={state.customer}
        redeemPoints={state.redeemPoints}
        isSubmitting={props.isSubmitting}
        errorMsg={props.submitError}
        isOffline={props.isOffline}
        onUpdateSplit={(p) => dispatch({ type: "SET_SPLIT_PAYMENTS", payload: p })}
        onUpdateRedeemPoints={(pts) => dispatch({ type: "SET_REDEEM_POINTS", payload: pts })}
        onSubmit={props.onCompleteSplitSale}
        onClose={props.onClosePayment}
      />

      <HeldBillsModal
        isListOpen={props.isHeldListOpen}
        isParkOpen={props.isParkOpen}
        itemCount={state.cart.length}
        dataSource={ds}
        onHoldBill={handleHoldBill}
        onResumeBill={handleResumeBill}
        onClose={props.onCloseHeld}
      />

      <SubstitutesModal
        isOpen={Boolean(props.substituteGeneric)}
        genericName={props.substituteGeneric || ""}
        dataSource={ds}
        onSelectSubstitute={(m, b, all) => dispatch({ type: "ADD_LINE", payload: { medicine: m, batch: b, allBatches: all } })}
        onClose={props.onCloseSubstitute}
      />

      <PromiseOrderModal
        isOpen={Boolean(props.promiseMedicine)}
        medicine={props.promiseMedicine}
        defaultCustomerName={state.customer?.name}
        defaultCustomerPhone={state.customer?.phone || ""}
        dataSource={ds}
        onSuccess={() => refreshMeta()}
        onClose={props.onClosePromise}
      />
    </>
  );
}
