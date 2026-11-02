"use client";

import { useReducer, useMemo, useCallback, useEffect } from "react";
import type { PosState, PosAction, PosCartLine, ComplianceState, SplitPayments } from "./types";
import { computeSaleTotals } from "@/lib/money";
import { playCounterSound } from "@/lib/sound";

export const initialComplianceState: ComplianceState = {
  doctorId: "",
  doctorName: "",
  doctorRegNo: "",
  doctorAddress: "",
  patientAge: "",
  patientGender: "male",
  patientAddress: "",
  prescriptionRef: "",
  prescriptionDate: new Date().toISOString().slice(0, 10),
  medicalRepId: "",
};

export const initialSplitPayments: SplitPayments = {
  cash: "",
  upi: "",
  card: "",
};

export const initialPosState: PosState = {
  cart: [],
  customer: null,
  compliance: initialComplianceState,
  splitPayments: initialSplitPayments,
  paymentMethod: "cash",
  redeemPoints: 0,
  resumedHeldId: null,
  soundEnabled: true,
};

export function posCartReducer(state: PosState, action: PosAction): PosState {
  switch (action.type) {
    case "ADD_LINE": {
      const { medicine, batch, allBatches, schemeText } = action.payload;
      const unitsPerPack = Math.max(1, medicine.unitsPerPack ?? 1);
      const existingIdx = state.cart.findIndex((i) => i.batchId === batch.id);

      if (existingIdx >= 0) {
        const nextCart = [...state.cart];
        const existing = nextCart[existingIdx];
        const nextPack = existing.packQty + 1;
        const nextTotalQty = nextPack * existing.unitsPerPack + existing.looseQty;
        nextCart[existingIdx] = { ...existing, packQty: nextPack, qty: nextTotalQty };
        return { ...state, cart: nextCart };
      }

      const newLine: PosCartLine = {
        batchId: batch.id,
        medicineId: medicine.id,
        medicineName: medicine.name,
        genericName: medicine.genericName,
        batchNo: batch.batchNo,
        expiryDate: batch.expiryDate,
        mrp: batch.mrp,
        saleRate: batch.saleRate ?? batch.mrp,
        packQty: 1,
        looseQty: 0,
        qty: unitsPerPack * 1,
        unitsPerPack,
        packUnit: medicine.packUnit ?? "strip",
        looseUnit: medicine.looseUnit ?? "tablet",
        qtyOnHand: batch.qtyOnHand,
        totalAvailableStock: allBatches?.reduce((s, b) => s + b.qtyOnHand, 0) ?? batch.qtyOnHand,
        discountBp: 0,
        gstRateBp: medicine.gstRateBp,
        rxRequired: medicine.rxRequired,
        schedule: medicine.schedule,
        schemeText,
        autoFefo: true,
        availableBatches: allBatches,
      };

      return { ...state, cart: [newLine, ...state.cart] };
    }

    case "UPDATE_LINE_PACK_QTY": {
      const safePack = Math.max(0, action.payload.packQty);
      const nextCart = state.cart.map((line) => {
        if (line.batchId !== action.payload.batchId) return line;
        const upp = Math.max(1, line.unitsPerPack ?? 1);
        let packQty = safePack;
        let looseQty = line.looseQty;
        if (upp > 1 && looseQty >= upp) {
          packQty += Math.floor(looseQty / upp);
          looseQty = looseQty % upp;
        }
        return { ...line, packQty, looseQty, qty: packQty * upp + looseQty };
      });
      return { ...state, cart: nextCart };
    }

    case "UPDATE_LINE_LOOSE_QTY": {
      const rawLoose = Math.max(0, action.payload.looseQty);
      const nextCart = state.cart.map((line) => {
        if (line.batchId !== action.payload.batchId) return line;
        const upp = Math.max(1, line.unitsPerPack ?? 1);
        let packQty = line.packQty;
        let looseQty = rawLoose;
        if (upp > 1 && looseQty >= upp) {
          packQty += Math.floor(looseQty / upp);
          looseQty = looseQty % upp;
        }
        return { ...line, packQty, looseQty, qty: packQty * upp + looseQty };
      });
      return { ...state, cart: nextCart };
    }

    case "UPDATE_LINE_DISCOUNT": {
      const safeDiscount = Math.min(10000, Math.max(0, action.payload.discountBp));
      const nextCart = state.cart.map((line) =>
        line.batchId === action.payload.batchId ? { ...line, discountBp: safeDiscount } : line
      );
      return { ...state, cart: nextCart };
    }

    case "UPDATE_LINE_BATCH": {
      const { oldBatchId, newBatch, reason } = action.payload;
      const isOverride = Boolean(reason);
      const nextCart = state.cart.map((line) => {
        if (line.batchId !== oldBatchId) return line;
        return {
          ...line,
          batchId: newBatch.id,
          batchNo: newBatch.batchNo,
          expiryDate: newBatch.expiryDate,
          mrp: newBatch.mrp,
          saleRate: newBatch.saleRate ?? newBatch.mrp,
          qtyOnHand: newBatch.qtyOnHand,
          autoFefo: !isOverride,
          overrideBatch: isOverride,
          overrideReason: reason,
        };
      });
      return { ...state, cart: nextCart };
    }

    case "REMOVE_LINE":
      return { ...state, cart: state.cart.filter((l) => l.batchId !== action.payload.batchId) };

    case "CLEAR_CART":
      return { ...state, cart: [] };

    case "SET_CUSTOMER":
      return { ...state, customer: action.payload, redeemPoints: 0 };

    case "SET_CUSTOMER_REDEEMABLE":
      if (!state.customer) return state;
      return {
        ...state,
        customer: {
          ...state.customer,
          redeemablePoints: action.payload.redeemablePoints,
          redeemableValuePaise: action.payload.redeemableValuePaise,
        },
      };

    case "SET_COMPLIANCE":
      return { ...state, compliance: { ...state.compliance, ...action.payload } };

    case "SET_PAYMENT_METHOD":
      return { ...state, paymentMethod: action.payload };

    case "SET_SPLIT_PAYMENTS":
      return { ...state, splitPayments: { ...state.splitPayments, ...action.payload } };

    case "SET_REDEEM_POINTS":
      return { ...state, redeemPoints: Math.max(0, action.payload) };

    case "SET_SOUND_ENABLED":
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("pos_sound_enabled", String(action.payload));
        } catch {
          // ignore localStorage access errors
        }
      }
      return { ...state, soundEnabled: action.payload };

    case "HYDRATE_HELD_SALE":
      return {
        ...state,
        resumedHeldId: action.payload.heldSaleId,
        cart: action.payload.lines,
        customer: action.payload.customer ?? state.customer,
        compliance: action.payload.doctorName
          ? { ...state.compliance, doctorName: action.payload.doctorName }
          : state.compliance,
      };

    case "RESET_SALE":
      return { ...initialPosState, soundEnabled: state.soundEnabled };

    default:
      return state;
  }
}

export function usePosCart() {
  const [state, dispatch] = useReducer(posCartReducer, initialPosState);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("pos_sound_enabled");
      if (stored !== null) {
        dispatch({ type: "SET_SOUND_ENABLED", payload: stored === "true" });
      }
    }
  }, []);

  const loyaltyDiscountPaise = useMemo(() => {
    if (!state.customer || state.redeemPoints <= 0) return 0;
    const rate = state.customer.redeemablePoints && state.customer.redeemableValuePaise
      ? Math.round(state.customer.redeemableValuePaise / state.customer.redeemablePoints)
      : 100;
    return state.redeemPoints * rate;
  }, [state.customer, state.redeemPoints]);

  const totals = useMemo(() => {
    const lineInputs = state.cart.map((line) => ({
      batchId: line.batchId,
      medicineId: line.medicineId,
      qty: line.qty,
      packQty: line.packQty,
      looseQty: line.looseQty,
      unitsPerPack: line.unitsPerPack,
      rate: line.saleRate ?? line.mrp,
      discountBp: line.discountBp,
      gstRateBp: line.gstRateBp,
    }));
    return computeSaleTotals(lineInputs, false, loyaltyDiscountPaise);
  }, [state.cart, loyaltyDiscountPaise]);

  const rxWarning = useMemo(
    () => state.cart.some((i) => Boolean(i.rxRequired)),
    [state.cart]
  );

  const controlledItems = useMemo(
    () =>
      state.cart.filter(
        (i) => i.schedule && ["H", "H1", "X", "NARCOTIC"].includes(i.schedule.toUpperCase())
      ),
    [state.cart]
  );

  const playSound = useCallback(
    (type: "beep" | "chime") => playCounterSound(type, state.soundEnabled),
    [state.soundEnabled]
  );

  return {
    state,
    dispatch,
    totals,
    loyaltyDiscountPaise,
    rxWarning,
    controlledItems,
    playSound,
  };
}
