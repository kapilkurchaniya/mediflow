"use client";

import { useReducer, useMemo, useCallback, useEffect, useRef } from "react";
import type { PosState, PosAction, PosCartLine, ComplianceState, SplitPayments } from "./types";
import { computeSaleTotals } from "@/lib/money";
import { playCounterSound } from "@/lib/sound";
import { saveDraftCart, loadDraftCart, clearDraftCart, type CartIdentity } from "@/lib/pos-cart-persistence";

export const initialComplianceState: ComplianceState = {
  doctorId: "", doctorName: "", doctorRegNo: "", doctorAddress: "",
  patientAge: "", patientGender: "male", patientAddress: "",
  prescriptionRef: "", prescriptionDate: new Date().toISOString().slice(0, 10),
  medicalRepId: "",
};

export const initialSplitPayments: SplitPayments = { cash: "", upi: "", card: "" };

export const initialPosState: PosState = {
  cart: [], customer: null, compliance: initialComplianceState,
  splitPayments: initialSplitPayments, paymentMethod: "cash",
  redeemPoints: 0, resumedHeldId: null, soundEnabled: true,
};

function normalizeQty(line: PosCartLine, rawPack: number, rawLoose: number) {
  const upp = Math.max(1, line.unitsPerPack ?? 1);
  let packQty = Math.max(0, rawPack);
  let looseQty = Math.max(0, rawLoose);
  if (upp > 1 && looseQty >= upp) {
    packQty += Math.floor(looseQty / upp);
    looseQty = looseQty % upp;
  }
  return { ...line, packQty, looseQty, qty: packQty * upp + looseQty };
}

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
        nextCart[existingIdx] = { ...existing, packQty: nextPack, qty: nextPack * existing.unitsPerPack + existing.looseQty };
        return { ...state, cart: nextCart };
      }

      const newLine: PosCartLine = {
        batchId: batch.id, medicineId: medicine.id, medicineName: medicine.name,
        genericName: medicine.genericName, batchNo: batch.batchNo, expiryDate: batch.expiryDate,
        mrp: batch.mrp, saleRate: batch.saleRate ?? batch.mrp, packQty: 1, looseQty: 0,
        qty: unitsPerPack * 1, unitsPerPack, packUnit: medicine.packUnit ?? "strip",
        looseUnit: medicine.looseUnit ?? "tablet", qtyOnHand: batch.qtyOnHand,
        totalAvailableStock: allBatches?.reduce((s, b) => s + b.qtyOnHand, 0) ?? batch.qtyOnHand,
        discountBp: 0, gstRateBp: medicine.gstRateBp, rxRequired: medicine.rxRequired,
        schedule: medicine.schedule, schemeText, autoFefo: true, availableBatches: allBatches,
      };
      return { ...state, cart: [newLine, ...state.cart] };
    }

    case "UPDATE_LINE_PACK_QTY":
      return {
        ...state,
        cart: state.cart.map((line) => line.batchId === action.payload.batchId ? normalizeQty(line, action.payload.packQty, line.looseQty) : line),
      };

    case "UPDATE_LINE_LOOSE_QTY":
      return {
        ...state,
        cart: state.cart.map((line) => line.batchId === action.payload.batchId ? normalizeQty(line, line.packQty, action.payload.looseQty) : line),
      };

    case "UPDATE_LINE_DISCOUNT": {
      const safeDiscount = Math.min(10000, Math.max(0, action.payload.discountBp));
      return {
        ...state,
        cart: state.cart.map((l) => l.batchId === action.payload.batchId ? { ...l, discountBp: safeDiscount } : l),
      };
    }

    case "UPDATE_LINE_BATCH": {
      const { oldBatchId, newBatch, reason } = action.payload;
      const isOverride = Boolean(reason);
      return {
        ...state,
        cart: state.cart.map((line) => line.batchId !== oldBatchId ? line : {
          ...line, batchId: newBatch.id, batchNo: newBatch.batchNo, expiryDate: newBatch.expiryDate,
          mrp: newBatch.mrp, saleRate: newBatch.saleRate ?? newBatch.mrp, qtyOnHand: newBatch.qtyOnHand,
          autoFefo: !isOverride, overrideBatch: isOverride, overrideReason: reason,
        }),
      };
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
        customer: { ...state.customer, redeemablePoints: action.payload.redeemablePoints, redeemableValuePaise: action.payload.redeemableValuePaise },
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
        try { localStorage.setItem("pos_sound_enabled", String(action.payload)); } catch { /* ignore */ }
      }
      return { ...state, soundEnabled: action.payload };

    case "HYDRATE_HELD_SALE":
      return {
        ...state, resumedHeldId: action.payload.heldSaleId, cart: action.payload.lines,
        customer: action.payload.customer ?? state.customer,
        compliance: action.payload.doctorName ? { ...state.compliance, doctorName: action.payload.doctorName } : state.compliance,
      };

    case "HYDRATE_DRAFT_CART":
      return {
        ...state,
        cart: action.payload.lines,
        customer: action.payload.customer ?? state.customer,
        compliance: action.payload.compliance ? { ...state.compliance, ...action.payload.compliance } : state.compliance,
        paymentMethod: action.payload.paymentMethod ?? state.paymentMethod,
        splitPayments: action.payload.splitPayments ? { ...state.splitPayments, ...action.payload.splitPayments } : state.splitPayments,
        redeemPoints: action.payload.redeemPoints ?? state.redeemPoints,
      };

    case "RESET_SALE":
      return { ...initialPosState, soundEnabled: state.soundEnabled };

    default:
      return state;
  }
}

export function usePosCart(identity?: CartIdentity) {
  const [state, dispatch] = useReducer(posCartReducer, initialPosState);
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("pos_sound_enabled");
      if (stored !== null) dispatch({ type: "SET_SOUND_ENABLED", payload: stored === "true" });
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadDraftCart(identity ?? {}).then((draft) => {
      if (!active) return;
      if (draft && draft.lines.length > 0) {
        dispatch({ type: "HYDRATE_DRAFT_CART", payload: draft });
      }
      hasHydratedRef.current = true;
    });
    return () => { active = false; };
  }, [identity?.tenantId, identity?.storeId, identity?.userId, identity?.terminalId, identity]);

  useEffect(() => {
    if (!hasHydratedRef.current) return;
    if (state.cart.length > 0) {
      void saveDraftCart(identity ?? {}, {
        lines: state.cart, customer: state.customer, compliance: state.compliance,
        paymentMethod: state.paymentMethod, splitPayments: state.splitPayments,
        redeemPoints: state.redeemPoints,
      });
    } else {
      void clearDraftCart(identity ?? {});
    }
  }, [state.cart, state.customer, state.compliance, state.paymentMethod, state.splitPayments, state.redeemPoints, identity]);

  const loyaltyDiscountPaise = useMemo(() => {
    if (!state.customer || state.redeemPoints <= 0) return 0;
    const rate = state.customer.redeemablePoints && state.customer.redeemableValuePaise
      ? Math.round(state.customer.redeemableValuePaise / state.customer.redeemablePoints)
      : 100;
    return state.redeemPoints * rate;
  }, [state.customer, state.redeemPoints]);

  const totals = useMemo(() => {
    const lineInputs = state.cart.map((line) => ({
      batchId: line.batchId, medicineId: line.medicineId, qty: line.qty, packQty: line.packQty,
      looseQty: line.looseQty, unitsPerPack: line.unitsPerPack, rate: line.saleRate ?? line.mrp,
      discountBp: line.discountBp, gstRateBp: line.gstRateBp,
    }));
    return computeSaleTotals(lineInputs, false, loyaltyDiscountPaise);
  }, [state.cart, loyaltyDiscountPaise]);

  const rxWarning = useMemo(() => state.cart.some((i) => Boolean(i.rxRequired)), [state.cart]);

  const controlledItems = useMemo(
    () => state.cart.filter((i) => i.schedule && ["H", "H1", "X", "NARCOTIC"].includes(i.schedule.toUpperCase())),
    [state.cart]
  );

  const playSound = useCallback((type: "beep" | "chime") => playCounterSound(type, state.soundEnabled), [state.soundEnabled]);

  return { state, dispatch, totals, loyaltyDiscountPaise, rxWarning, controlledItems, playSound };
}
