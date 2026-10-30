"use client";

import { useState, useRef, useEffect, useActionState, useCallback } from "react";
import { searchPosItems, createSaleInvoice, findSubstitutes, PosItemInput } from "@/app/actions/sales";
import { getCustomers, createQuickCustomer } from "@/app/actions/customers";
import { getDoctors } from "@/app/actions/compliance";
import { computeSaleTotals } from "@/lib/money";
import { formatINR, formatNumber } from "@/lib/format";
import {
  Search,
  ShoppingCart,
  User,
  Stethoscope,
  ArrowLeft,
  Trash2,
  Printer,
  Plus,
  AlertTriangle,
  Sparkles,
  X,
  Volume2,
  VolumeX,
  PackageX,
  CreditCard,
  QrCode,
  Banknote,
  RotateCcw,
  ShieldAlert,
  BookmarkCheck,
  Layers,
  Tag,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPromiseOrder } from "@/app/actions/promise-orders";
import { checkItemScheme } from "@/app/actions/schemes";
import { getMedicalReps } from "@/app/actions/medical-reps";

interface SearchResult {
  medicine: {
    id: string;
    name: string;
    genericName?: string | null;
    gstRateBp: number;
    rxRequired?: boolean | null;
    schedule?: string | null;
    rackCode?: string | null;
    rackName?: string | null;
    unitsPerPack?: number;
    packUnit?: string;
    looseUnit?: string;
  };
  batches: {
    id: string;
    batchNo: string;
    expiryDate: string;
    qtyOnHand: number;
    mrp: number;
    saleRate?: number;
  }[];
}

interface SubstituteItem {
  medicine: {
    id: string;
    name: string;
    genericName?: string | null;
    gstRateBp: number;
  };
  batches: {
    id: string;
    batchNo: string;
    expiryDate: string;
    qtyOnHand: number;
    mrp: number;
    saleRate?: number;
  }[];
  totalStock: number;
}

// Synthesize pleasant counter tones without external assets
function playSound(type: "beep" | "chime") {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (type === "beep") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(920, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } else if (type === "chime") {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 arpeggio
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.05);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.05 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.05);
        osc.stop(ctx.currentTime + idx * 0.05 + 0.18);
      });
    }
  } catch {
    // Audio context may be restricted by browser until user gesture
  }
}

export default function POSPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<{ id: string; name: string; phone?: string | null; loyaltyPoints?: number; creditLimit?: number | null }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);

  const [customerId, setCustomerId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Split Tender Modal state
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitCash, setSplitCash] = useState("");
  const [splitUpi, setSplitUpi] = useState("");
  const [splitCard, setSplitCard] = useState("");
  const [splitError, setSplitError] = useState("");
  const [isSubmittingSplit, setIsSubmittingSplit] = useState(false);

  // Quick Customer modal state
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [custModalError, setCustModalError] = useState("");
  const [isSavingCust, setIsSavingCust] = useState(false);

  // Substitute finder state
  const [isSubstitutesModalOpen, setIsSubstitutesModalOpen] = useState(false);
  const [substituteGeneric, setSubstituteGeneric] = useState("");
  const [substitutesList, setSubstitutesList] = useState<SubstituteItem[]>([]);
  const [isLoadingSubstitutes, setIsLoadingSubstitutes] = useState(false);

  // Compliance & Prescriber state
  const [doctorsList, setDoctorsList] = useState<Array<{ id: string; name: string; regNo: string; hospital?: string | null }>>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [doctorRegNo, setDoctorRegNo] = useState("");
  const [doctorAddress, setDoctorAddress] = useState("");
  const [patientAge, setPatientAge] = useState<number | "">("");
  const [patientGender, setPatientGender] = useState("male");
  const [patientAddress, setPatientAddress] = useState("");
  const [prescriptionRef, setPrescriptionRef] = useState("");
  const [prescriptionDate, setPrescriptionDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [medicalRepsList, setMedicalRepsList] = useState<Array<{ id: string; name: string; companyName: string | null }>>([]);
  const [selectedMedicalRepId, setSelectedMedicalRepId] = useState("");

  const [cart, setCart] = useState<
    (Omit<PosItemInput, "qty"> & {
      qty: number;
      medicineName: string;
      batchNo: string;
      expiryDate: string;
      mrp: number;
      qtyOnHand: number;
      gstRateBp: number;
      rxRequired?: boolean | null;
      schedule?: string | null;
      schemeText?: string;
      unitsPerPack: number;
      packUnit: string;
      looseUnit: string;
      packQty: number;
      looseQty: number;
    })[]
  >([]);

  // Promise Order modal state
  const [isPromiseModalOpen, setIsPromiseModalOpen] = useState(false);
  const [promiseMed, setPromiseMed] = useState<{ id: string; name: string } | null>(null);
  const [promiseCustName, setPromiseCustName] = useState("");
  const [promiseCustPhone, setPromiseCustPhone] = useState("");
  const [promiseQty, setPromiseQty] = useState(1);
  const [promiseNotes, setPromiseNotes] = useState("");
  const [isSavingPromise, setIsSavingPromise] = useState(false);

  // Rx validation alert (derived directly from cart)
  const rxWarning = cart.some((i) => Boolean(i.rxRequired));
  const controlledItems = cart.filter(
    (i) => i.schedule && ["H", "H1", "X", "NARCOTIC"].includes(i.schedule.toUpperCase())
  );
  const isComplianceMandatory = controlledItems.length > 0 || rxWarning;
  const isH1OrHigher = cart.some(
    (i) => i.schedule && ["H1", "X", "NARCOTIC"].includes(i.schedule.toUpperCase())
  );

  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeBufferRef = useRef<{ buffer: string; lastTime: number }>({ buffer: "", lastTime: 0 });

  // Load customer and doctor lists on mount
  useEffect(() => {
    getCustomers().then((data) => {
      setCustomers(data.map((c) => ({ id: c.id, name: c.name, phone: c.phone, loyaltyPoints: c.loyaltyPoints || 0, creditLimit: c.creditLimit })));
    });
    getDoctors().then((data) => {
      setDoctorsList(data.map((d) => ({ id: d.id, name: d.name, regNo: d.regNo, hospital: d.hospital })));
    });
    getMedicalReps().then((data) => {
      setMedicalRepsList(data.filter((r) => r.isActive).map((r) => ({ id: r.id, name: r.name, companyName: r.companyName })));
    });
    if (searchInputRef.current) searchInputRef.current.focus();
  }, []);

  const handleDoctorSelect = (docId: string) => {
    setSelectedDoctorId(docId);
    if (docId) {
      const doc = doctorsList.find((d) => d.id === docId);
      if (doc) {
        setDoctorName(doc.name);
        setDoctorRegNo(doc.regNo);
        setDoctorAddress(doc.hospital || "");
      }
    }
  };

  // Add item to cart
  const addToCart = useCallback(
    (
      medicine: SearchResult["medicine"],
      batch: SearchResult["batches"][0]
    ) => {
      if (batch.qtyOnHand <= 0) return;

      if (soundEnabled) playSound("beep");

      const upp = Math.max(1, medicine.unitsPerPack ?? 1);
      const packUnit = medicine.packUnit ?? "strip";
      const looseUnit = medicine.looseUnit ?? "tablet";

      setCart((current) => {
        const existingIndex = current.findIndex((c) => c.batchId === batch.id);
        if (existingIndex >= 0) {
          const updated = [...current];
          const item = updated[existingIndex];
          const newPackQty = (item.packQty ?? 0) + 1;
          const newTotalBase = (newPackQty * upp) + (item.looseQty ?? 0);
          if (newTotalBase <= batch.qtyOnHand) {
            item.packQty = newPackQty;
            item.qty = newTotalBase;
          }
          return updated;
        } else {
          return [
            ...current,
            {
              medicineId: medicine.id,
              batchId: batch.id,
              medicineName: medicine.name,
              batchNo: batch.batchNo,
              expiryDate: batch.expiryDate,
              qty: upp,
              packQty: 1,
              looseQty: 0,
              unitsPerPack: upp,
              packUnit,
              looseUnit,
              qtyOnHand: batch.qtyOnHand,
              mrp: batch.mrp,
              rate: batch.saleRate || batch.mrp,
              discountBp: 0,
              gstRateBp: medicine.gstRateBp,
              rxRequired: medicine.rxRequired,
              schedule: medicine.schedule,
            },
          ];
        }
      });

      setSearchQuery("");
      setSearchResults([]);
      setSelectedResultIndex(0);
      searchInputRef.current?.focus();

      // Check for trade schemes on item
      checkItemScheme({
        medicineId: medicine.id,
        qty: 1,
        unitPricePaise: batch.saleRate || batch.mrp,
      }).then((schemeResult) => {
        if (schemeResult) {
          setCart((curr) =>
            curr.map((c) =>
              c.batchId === batch.id
                ? {
                    ...c,
                    schemeText: schemeResult.description,
                    discountBp:
                      schemeResult.discountAmount > 0 && c.rate > 0
                        ? Math.round((schemeResult.discountAmount / (c.qty * c.rate)) * 10000)
                        : c.discountBp,
                  }
                : c
            )
          );
        }
      });
    },
    [soundEnabled]
  );

  // Open substitute finder modal
  const openSubstituteFinder = async (genericName: string, medicineId?: string) => {
    if (!genericName) return;
    setSubstituteGeneric(genericName);
    setIsSubstitutesModalOpen(true);
    setIsLoadingSubstitutes(true);
    try {
      const list = await findSubstitutes(genericName, medicineId);
      setSubstitutesList(list as SubstituteItem[]);
    } finally {
      setIsLoadingSubstitutes(false);
    }
  };

  // Open promise order modal for out of stock item
  const openPromiseModal = (med: { id: string; name: string }) => {
    setPromiseMed(med);
    const cust = customers.find((c) => c.id === customerId);
    setPromiseCustName(cust?.name || "");
    setPromiseCustPhone(cust?.phone || "");
    setPromiseQty(1);
    setPromiseNotes("");
    setIsPromiseModalOpen(true);
  };

  const handleSavePromiseOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promiseMed || !promiseCustName.trim() || !promiseCustPhone.trim()) return;
    setIsSavingPromise(true);
    try {
      const res = await createPromiseOrder({
        medicineId: promiseMed.id,
        medicineName: promiseMed.name,
        customerName: promiseCustName.trim(),
        customerPhone: promiseCustPhone.trim(),
        qtyRequested: promiseQty,
        notes: promiseNotes.trim() || undefined,
        customerId: customerId || undefined,
      });
      if (res.error) {
        alert("Failed to save promise order: " + res.error);
      } else {
        setIsPromiseModalOpen(false);
        alert(`Promise order successfully recorded for ${promiseCustName}!`);
      }
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSavingPromise(false);
    }
  };

  const totals = computeSaleTotals(
    cart.map((c) => ({
      qty: c.qty,
      packQty: c.packQty,
      looseQty: c.looseQty,
      unitsPerPack: c.unitsPerPack,
      rate: c.rate,
      discountBp: c.discountBp,
      gstRateBp: c.gstRateBp,
    }))
  );

  const netPayable = totals.total;

  // Keyboard navigation & Barcode buffer listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();

      // Barcode Hardware Scanner Buffer Detection:
      // Scanners type fast characters (< 40ms) and finish with Enter
      if (e.key === "Enter" && barcodeBufferRef.current.buffer.length > 5) {
        const scannedCode = barcodeBufferRef.current.buffer;
        barcodeBufferRef.current = { buffer: "", lastTime: 0 };
        // Trigger search for this barcode
        searchPosItems(scannedCode).then((results) => {
          if (results.length > 0 && results[0].batches.length > 0) {
            addToCart(results[0].medicine, results[0].batches[0]);
          }
        });
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (now - barcodeBufferRef.current.lastTime < 45) {
          barcodeBufferRef.current.buffer += e.key;
          barcodeBufferRef.current.lastTime = now;
        } else {
          barcodeBufferRef.current.buffer = e.key;
          barcodeBufferRef.current.lastTime = now;
        }
      }

      // F2: Clear / New Bill
      if (e.key === "F2") {
        e.preventDefault();
        if (cart.length > 0) {
          if (confirm("Reset current bill and start a new transaction?")) {
            setCart([]);
            setCustomerId("");
            setDoctorName("");
            searchInputRef.current?.focus();
          }
        } else {
          searchInputRef.current?.focus();
        }
      }

      // F3: Focus Search
      if (e.key === "F3" || (e.ctrlKey && e.key.toLowerCase() === "f")) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }

      // F4: Quick Customer
      if (e.key === "F4") {
        e.preventDefault();
        setIsCustomerModalOpen(true);
      }

      // F8: Split Tender
      if (e.key === "F8") {
        e.preventDefault();
        if (cart.length > 0) {
          setSplitCash((netPayable / 100).toString());
          setSplitUpi("");
          setSplitCard("");
          setSplitError("");
          setIsSplitModalOpen(true);
        }
      }

      // Esc: Dismiss modals or search
      if (e.key === "Escape") {
        if (isCustomerModalOpen) setIsCustomerModalOpen(false);
        if (isSubstitutesModalOpen) setIsSubstitutesModalOpen(false);
        if (isPromiseModalOpen) setIsPromiseModalOpen(false);
        if (isSplitModalOpen) setIsSplitModalOpen(false);
        if (searchResults.length > 0) {
          setSearchResults([]);
          searchInputRef.current?.focus();
        }
      }

      // Arrow navigation in search results
      if (searchResults.length > 0) {
        const flatBatches: { med: SearchResult["medicine"]; batch: SearchResult["batches"][0] }[] = [];
        searchResults.forEach((res) => {
          res.batches.forEach((b) => flatBatches.push({ med: res.medicine, batch: b }));
        });

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedResultIndex((prev) => (prev < flatBatches.length - 1 ? prev + 1 : 0));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedResultIndex((prev) => (prev > 0 ? prev - 1 : flatBatches.length - 1));
        } else if (e.key === "Enter" && !e.ctrlKey) {
          if (flatBatches[selectedResultIndex]) {
            e.preventDefault();
            addToCart(flatBatches[selectedResultIndex].med, flatBatches[selectedResultIndex].batch);
          }
        }
      }
    };

    const handleAiAdd = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setCart((c) => {
          const existing = c.find((i) => i.medicineId === detail.medicineId && i.batchId === detail.batchId);
          if (existing) {
            return c.map((i) =>
              i.medicineId === detail.medicineId && i.batchId === detail.batchId
                ? { ...i, qty: i.qty + 1 }
                : i
            );
          }
          return [...c, detail];
        });
        if (soundEnabled) playSound("beep");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("ai-add-to-bill", handleAiAdd);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("ai-add-to-bill", handleAiAdd);
    };
  }, [searchResults, selectedResultIndex, addToCart, cart.length, isCustomerModalOpen, isSubstitutesModalOpen, isPromiseModalOpen, isSplitModalOpen, soundEnabled, netPayable]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery || searchQuery.trim().length < 2) return;

    setIsSearching(true);
    try {
      const results = await searchPosItems(searchQuery.trim());
      setSearchResults(results as SearchResult[]);
      setSelectedResultIndex(0);
    } finally {
      setIsSearching(false);
    }
  };

  const updateCartPackQty = (index: number, newPackQty: number) => {
    const newCart = [...cart];
    const item = newCart[index];
    const pQty = Math.max(0, newPackQty);
    const lQty = item.looseQty ?? 0;
    const upp = Math.max(1, item.unitsPerPack ?? 1);
    const totalBase = pQty * upp + lQty;
    if (totalBase > 0 && totalBase <= item.qtyOnHand) {
      item.packQty = pQty;
      item.qty = totalBase;
      setCart(newCart);
    }
  };

  const updateCartLooseQty = (index: number, newLooseQty: number) => {
    const newCart = [...cart];
    const item = newCart[index];
    const upp = Math.max(1, item.unitsPerPack ?? 1);
    let pQty = item.packQty ?? 0;
    let lQty = Math.max(0, newLooseQty);
    if (lQty >= upp) {
      pQty += Math.floor(lQty / upp);
      lQty = lQty % upp;
    }
    const totalBase = pQty * upp + lQty;
    if (totalBase > 0 && totalBase <= item.qtyOnHand) {
      item.packQty = pQty;
      item.looseQty = lQty;
      item.qty = totalBase;
      setCart(newCart);
    }
  };

  const updateCartQty = (index: number, newQty: number) => {
    const newCart = [...cart];
    const item = newCart[index];
    const upp = Math.max(1, item.unitsPerPack ?? 1);
    if (newQty > 0 && newQty <= item.qtyOnHand) {
      item.qty = newQty;
      item.packQty = Math.floor(newQty / upp);
      item.looseQty = newQty % upp;
      setCart(newCart);
    }
  };

  const updateCartDiscount = (index: number, discountPercent: number) => {
    const newCart = [...cart];
    newCart[index].discountBp = Math.min(10000, Math.max(0, Math.round(discountPercent * 100)));
    setCart(newCart);
  };

  const removeCartItem = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const handleQuickCustomerSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) {
      setCustModalError("Customer name is required");
      return;
    }

    setIsSavingCust(true);
    setCustModalError("");
    try {
      const res = await createQuickCustomer(newCustName, newCustPhone);
      if (res.success && res.customer) {
        setCustomers((prev) => [res.customer!, ...prev]);
        setCustomerId(res.customer.id);
        setIsCustomerModalOpen(false);
        setNewCustName("");
        setNewCustPhone("");
        if (soundEnabled) playSound("beep");
      } else {
        setCustModalError(res.error || "Failed to add customer");
      }
    } finally {
      setIsSavingCust(false);
    }
  };

  const handleSplitCheckout = async () => {
    if (cart.length === 0) return;
    setSplitError("");

    if (isComplianceMandatory && !doctorName.trim()) {
      setSplitError("Doctor's name is mandatory for Schedule H / Prescription (Rx) medicines in this bill.");
      return;
    }
    if (isH1OrHigher && !doctorRegNo.trim()) {
      setSplitError("Doctor Medical Council Registration Number is mandatory for Schedule H1 / Schedule X drugs.");
      return;
    }

    const cashPaise = Math.round((parseFloat(splitCash) || 0) * 100);
    const upiPaise = Math.round((parseFloat(splitUpi) || 0) * 100);
    const cardPaise = Math.round((parseFloat(splitCard) || 0) * 100);
    const tenderedTotal = cashPaise + upiPaise + cardPaise;

    if (tenderedTotal > netPayable) {
      const excess = tenderedTotal - netPayable;
      if (excess > cashPaise) {
        setSplitError("Only cash can be overpaid. Non-cash payments cannot exceed the bill total.");
        return;
      }
    }

    const paidAmount = Math.min(tenderedTotal, netPayable);
    const creditAmount = Math.max(0, netPayable - paidAmount);

    if (creditAmount > 0 && !customerId) {
      setSplitError("Please select a registered customer to allow selling on credit.");
      return;
    }

    const splitPayments: { method: "cash" | "upi" | "card"; amount: number }[] = [];
    if (cashPaise > 0) splitPayments.push({ method: "cash", amount: cashPaise });
    if (upiPaise > 0) splitPayments.push({ method: "upi", amount: upiPaise });
    if (cardPaise > 0) splitPayments.push({ method: "card", amount: cardPaise });

    const complianceDetails = isComplianceMandatory ? {
      doctorName: doctorName.trim(),
      doctorRegNo: doctorRegNo.trim() || undefined,
      doctorAddress: doctorAddress.trim() || undefined,
      patientName: customers.find((c) => c.id === customerId)?.name || undefined,
      patientAge: patientAge === "" ? undefined : Number(patientAge),
      patientGender,
      patientAddress: patientAddress.trim() || undefined,
      prescriptionRef: prescriptionRef.trim() || undefined,
      prescriptionDate,
    } : undefined;

    setIsSubmittingSplit(true);
    try {
      const res = await createSaleInvoice(
        customerId,
        doctorName,
        cart,
        "split",
        0,
        complianceDetails,
        selectedMedicalRepId || undefined,
        splitPayments
      );

      if (res.success && res.saleId) {
        if (soundEnabled) playSound("chime");
        setIsSplitModalOpen(false);
        router.push(`/dashboard/sales/${res.saleId}/print?format=thermal`);
      } else {
        setSplitError(res.error || "Failed to complete sale");
      }
    } finally {
      setIsSubmittingSplit(false);
    }
  };

  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error?: string; success?: boolean } | null, _formData: FormData) => {
      if (cart.length === 0) return { error: "Cart is empty" };

      // Drug Compliance validation: require doctor name if Rx or controlled drug in cart
      if (isComplianceMandatory && !doctorName.trim()) {
        return {
          error: "Doctor's name is mandatory for Schedule H / Prescription (Rx) medicines in this bill.",
        };
      }
      if (isH1OrHigher && !doctorRegNo.trim()) {
        return {
          error: "Doctor Medical Council Registration Number is mandatory for Schedule H1 / Schedule X drugs under D&C Rules.",
        };
      }

      const complianceDetails = isComplianceMandatory ? {
        doctorName: doctorName.trim(),
        doctorRegNo: doctorRegNo.trim() || undefined,
        doctorAddress: doctorAddress.trim() || undefined,
        patientName: customers.find((c) => c.id === customerId)?.name || undefined,
        patientAge: patientAge === "" ? undefined : Number(patientAge),
        patientGender,
        patientAddress: patientAddress.trim() || undefined,
        prescriptionRef: prescriptionRef.trim() || undefined,
        prescriptionDate,
      } : undefined;

      const res = await createSaleInvoice(
        customerId,
        doctorName,
        cart,
        paymentMethod,
        netPayable,
        complianceDetails,
        selectedMedicalRepId || undefined
      );
      if (res.success && res.saleId) {
        if (soundEnabled) playSound("chime");
        router.push(`/dashboard/sales/${res.saleId}/print?format=thermal`);
        return { success: true, error: undefined };
      }
      return res;
    },
    null
  );

  // Flattened search items for index navigation
  let flatIdx = 0;

  return (
    <div className="h-[calc(100vh-7.5rem)] flex flex-col lg:flex-row gap-5">
      {/* ──────────────── Left Column: Search Bar & Active Bill ──────────────── */}
      <div className="flex-1 flex flex-col space-y-3.5 h-full min-w-0">
        {/* Top Header & Key Shortcut Indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/sales"
              className="btn btn-secondary btn-icon"
              title="Back to Sales register"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-ink-900 flex items-center gap-2">
                POS Billing Counter
                <span className="badge badge-brand !text-[11px] font-mono">F2 New Bill</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="btn btn-secondary btn-icon"
              title={soundEnabled ? "Mute audio feedback" : "Enable scanner audio tones"}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4 text-brand-600" /> : <VolumeX className="h-4 w-4 text-ink-400" />}
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("Reset current bill?")) {
                  setCart([]);
                  setCustomerId("");
                  setDoctorName("");
                  searchInputRef.current?.focus();
                }
              }}
              className="btn btn-secondary text-[12.5px]"
              title="Reset bill (F2)"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear (F2)
            </button>
          </div>
        </div>

        {/* Search Bar with live dropdown */}
        <div className="card p-3 relative shadow-xs">
          <form onSubmit={handleSearch} className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-ink-400" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-10 pr-24 py-2.5 text-[15px] font-medium"
              placeholder="F3 to search medicine, composition (e.g. Paracetamol) or scan barcode..."
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute inset-y-1.5 right-1.5 btn btn-secondary btn-sm"
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </form>

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-30 card shadow-pop overflow-hidden max-h-[380px] overflow-y-auto">
              <table className="data-table">
                <thead className="sticky top-0 bg-ink-50">
                  <tr>
                    <th>Medicine & Generic</th>
                    <th>Batch / Expiry</th>
                    <th className="text-right">Stock</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((res) => {
                    const hasStock = res.batches.length > 0;

                    if (!hasStock) {
                      return (
                        <tr key={res.medicine.id} className="bg-amber-50/40">
                          <td>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-ink-700">{res.medicine.name}</span>
                              <span className="badge badge-warning !text-[10px]">Out of Stock</span>
                              {res.medicine.rackCode && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-ink-100 text-ink-700">
                                  <Layers className="h-2.5 w-2.5 inline" /> Rack: {res.medicine.rackCode}
                                </span>
                              )}
                            </div>
                            <div className="text-[12px] text-ink-500 font-mono">
                              {res.medicine.genericName || "—"}
                            </div>
                          </td>
                          <td colSpan={3} className="text-ink-400 text-[12px] italic">
                            0 units on shelf
                          </td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {res.medicine.genericName && (
                                <button
                                  type="button"
                                  onClick={() => openSubstituteFinder(res.medicine.genericName!, res.medicine.id)}
                                  className="btn btn-secondary btn-sm !text-brand-700 !border-brand-200 hover:!bg-brand-50"
                                >
                                  <Sparkles className="h-3 w-3 mr-1" /> Substitutes
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openPromiseModal(res.medicine)}
                                className="btn btn-secondary btn-sm !text-amber-800 !border-amber-300 hover:!bg-amber-100"
                                title="Record patient demand for out-of-stock item"
                              >
                                <BookmarkCheck className="h-3 w-3 mr-1" /> Promise Order
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return res.batches.map((batch) => {
                      const currentIdx = flatIdx++;
                      const isHighlighted = currentIdx === selectedResultIndex;

                      return (
                        <tr
                          key={`${res.medicine.id}-${batch.id}`}
                          className={`cursor-pointer transition-colors ${
                            isHighlighted ? "bg-brand-50/70" : "hover:bg-ink-50"
                          }`}
                          onClick={() => addToCart(res.medicine, batch)}
                        >
                          <td>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-ink-900">{res.medicine.name}</span>
                              {res.medicine.rackCode && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-brand-50 text-brand-700 border border-brand-200" title={`Storage Location: ${res.medicine.rackCode}`}>
                                  <Layers className="h-2.5 w-2.5 inline" /> Rack: {res.medicine.rackCode}
                                </span>
                              )}
                              {res.medicine.rxRequired && (
                                <span className="badge badge-danger !text-[9.5px] !px-1">Rx</span>
                              )}
                            </div>
                            <div className="text-[11.5px] text-ink-500 truncate max-w-[280px]">
                              {res.medicine.genericName || "—"}
                            </div>
                          </td>
                          <td>
                            <span className="font-mono text-[12px] font-medium text-ink-800">{batch.batchNo}</span>
                            <div className="text-[11px] text-ink-500 num">
                              Exp: {new Date(batch.expiryDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                            </div>
                          </td>
                          <td className="text-right">
                            <span className="badge badge-success num font-semibold">{batch.qtyOnHand}</span>
                            {res.medicine.unitsPerPack && res.medicine.unitsPerPack > 1 && (
                              <div className="text-[10px] text-ink-500 font-mono">
                                {Math.floor(batch.qtyOnHand / res.medicine.unitsPerPack)} {res.medicine.packUnit || "p"} + {batch.qtyOnHand % res.medicine.unitsPerPack} {res.medicine.looseUnit || "t"}
                              </div>
                            )}
                          </td>
                          <td className="text-right font-medium text-ink-900 num">
                            {formatINR(batch.saleRate || batch.mrp)}
                          </td>
                          <td className="text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {res.medicine.genericName && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openSubstituteFinder(res.medicine.genericName!, res.medicine.id);
                                  }}
                                  className="btn btn-secondary btn-sm !p-1 text-ink-500 hover:text-brand-600"
                                  title="Find other brands with this molecule"
                                >
                                  <Sparkles className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addToCart(res.medicine, batch);
                                }}
                                className="btn btn-primary btn-sm !px-2.5"
                              >
                                Add
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Schedule H warning alert */}
        {rxWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 flex items-center gap-2.5 text-[12.5px] text-amber-900">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              <strong>Schedule H / Prescription Drug in cart:</strong> Prescribing doctor name is required by Indian pharma regulations before billing.
            </span>
          </div>
        )}

        {/* Active Bill Cart Table */}
        <div className="card flex-1 overflow-hidden flex flex-col shadow-xs">
          <div className="card-header !py-2.5 !px-4 bg-ink-50/60 flex justify-between items-center border-b border-ink-150">
            <h3 className="card-title flex items-center text-[13.5px]">
              <ShoppingCart className="h-4 w-4 mr-2 text-brand-600" />
              Billed Items
            </h3>
            <span className="badge badge-neutral num font-medium">
              {formatNumber(cart.length)} items · {formatNumber(cart.reduce((a, b) => a + b.qty, 0))} units
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-ink-400 p-8 text-center space-y-2">
                <ShoppingCart className="h-10 w-10 stroke-[1.4] opacity-25" />
                <p className="text-[13.5px] font-medium text-ink-600">Counter bill is currently empty</p>
                <p className="text-[12px] text-ink-400 max-w-xs">
                  Press <kbd className="px-1.5 py-0.5 rounded bg-ink-100 font-mono text-[11px] text-ink-700">F3</kbd> to search medicines or scan a product barcode with your scanner.
                </p>
              </div>
            ) : (
              <table className="data-table">
                <thead className="sticky top-0 bg-white shadow-2xs z-10">
                  <tr>
                    <th>Item & Batch</th>
                    <th className="w-24 text-center">Qty</th>
                    <th className="text-right">Rate</th>
                    <th className="w-24 text-center">Disc %</th>
                    <th className="text-right">Total</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, index) => {
                    const lineTotal = totals.lines[index]?.total ?? item.qty * item.rate;

                    return (
                      <tr key={`${item.batchId}-${index}`} className="hover:bg-ink-50/60">
                        <td>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-ink-900">{item.medicineName}</span>
                            {item.rxRequired && <span className="badge badge-danger !text-[9.5px] !px-1">Rx</span>}
                            {item.schedule && item.schedule !== "none" && (
                              <span className={`badge !text-[9px] !px-1 font-bold ${
                                item.schedule.toUpperCase() === "H1" ? "!bg-rose-100 !text-rose-800 !border-rose-300" :
                                item.schedule.toUpperCase() === "H" ? "!bg-amber-100 !text-amber-800 !border-amber-300" :
                                item.schedule.toUpperCase() === "X" ? "!bg-purple-100 !text-purple-800 !border-purple-300" :
                                item.schedule.toUpperCase() === "NARCOTIC" ? "!bg-red-100 !text-red-900 !border-red-400" :
                                "badge-neutral"
                              }`}>
                                Sched {item.schedule}
                              </span>
                            )}
                          </div>
                          <div className="cell-sub font-mono">
                            Batch: {item.batchNo} · Exp: {item.expiryDate}
                            {item.unitsPerPack > 1 && (
                              <span className="text-brand-600 font-medium ml-1">
                                (1 {item.packUnit} = {item.unitsPerPack} {item.looseUnit}s)
                              </span>
                            )}
                          </div>
                          {item.schemeText && (
                            <div className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 w-fit">
                              <Tag className="h-2.5 w-2.5" /> {item.schemeText}
                            </div>
                          )}
                        </td>
                        <td className="text-center">
                          {item.unitsPerPack > 1 ? (
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-1">
                                <div className="flex items-center" title={`Full ${item.packUnit}s`}>
                                  <input
                                    type="number"
                                    min="0"
                                    max={Math.floor(item.qtyOnHand / item.unitsPerPack)}
                                    value={item.packQty ?? 0}
                                    onChange={(e) => updateCartPackQty(index, parseInt(e.target.value) || 0)}
                                    className="input !h-7 !w-11 !px-1 text-center font-bold num text-xs"
                                  />
                                  <span className="text-[10px] text-ink-500 font-medium ml-0.5">p</span>
                                </div>
                                <span className="text-ink-400 text-xs">+</span>
                                <div className="flex items-center" title={`Loose ${item.looseUnit}s`}>
                                  <input
                                    type="number"
                                    min="0"
                                    max={item.unitsPerPack - 1}
                                    value={item.looseQty ?? 0}
                                    onChange={(e) => updateCartLooseQty(index, parseInt(e.target.value) || 0)}
                                    className="input !h-7 !w-11 !px-1 text-center font-bold num text-xs"
                                  />
                                  <span className="text-[10px] text-ink-500 font-medium ml-0.5">t</span>
                                </div>
                              </div>
                              <span className="text-[10px] text-ink-400 font-mono">
                                = {item.qty} {item.looseUnit}s
                              </span>
                            </div>
                          ) : (
                            <input
                              type="number"
                              min="1"
                              max={item.qtyOnHand}
                              value={item.qty}
                              onChange={(e) => updateCartQty(index, parseInt(e.target.value) || 1)}
                              className="input !h-8 !w-16 !px-1 text-center font-bold num"
                            />
                          )}
                        </td>
                        <td className="text-right font-medium num text-ink-700">
                          <div>{formatINR(item.rate)}</div>
                          {item.unitsPerPack > 1 && (
                            <div className="text-[10.5px] text-ink-400">
                              {formatINR(Math.round(item.rate / item.unitsPerPack))}/{item.looseUnit.slice(0, 3)}
                            </div>
                          )}
                        </td>
                        <td className="text-center">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={item.discountBp / 100 || ""}
                            placeholder="0"
                            onChange={(e) => updateCartDiscount(index, parseFloat(e.target.value) || 0)}
                            className="input !h-8 !w-16 !px-1 text-center num"
                          />
                        </td>
                        <td className="text-right font-bold num text-ink-900">{formatINR(lineTotal)}</td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => removeCartItem(index)}
                            className="text-ink-400 hover:text-red-600 transition-colors p-1"
                            title="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ──────────────── Right Column: Customer, Summary & Payment ──────────────── */}
      <div className="w-full lg:w-[370px] flex flex-col gap-3.5 shrink-0">
        <form action={formAction} className="flex flex-col h-full gap-3.5">
          {/* Customer & Doctor Panel */}
          <div className="card p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-ink-150 pb-2">
              <h3 className="font-semibold text-[13.5px] text-ink-900 flex items-center gap-1.5">
                <User className="h-4 w-4 text-brand-600" />
                Customer & Doctor
              </h3>
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(true)}
                className="text-[12px] font-medium text-brand-600 hover:text-brand-800 flex items-center"
              >
                <Plus className="h-3.5 w-3.5 mr-0.5" /> Quick Add (F4)
              </button>
            </div>

            <div>
              <label className="label text-[12px]">Customer</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="select text-[13px]"
              >
                <option value="">Walk-in Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ""}
                  </option>
                ))}
              </select>

              {(() => {
                const sel = customers.find((c) => c.id === customerId);
                if (!sel || !sel.loyaltyPoints) return null;
                return (
                  <div className="mt-1.5 flex items-center justify-between p-2 rounded-lg bg-amber-50/80 border border-amber-200 text-xs">
                    <span className="flex items-center gap-1 font-semibold text-amber-900">
                      <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                      Rewards: <span className="font-mono">{sel.loyaltyPoints} pts</span>
                    </span>
                    <span className="text-[11px] text-amber-700 font-medium">
                      Worth ₹{(sel.loyaltyPoints * 1.0).toFixed(2)}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div>
              <label className={`label text-[12px] flex items-center justify-between ${isComplianceMandatory ? "text-amber-800 font-semibold" : ""}`}>
                <span className="flex items-center">
                  <Stethoscope className="h-3 w-3 mr-1 text-brand-600" /> Prescribed By
                </span>
                {isComplianceMandatory && <span className="text-[11px] text-amber-700 font-bold">* Required for Rx</span>}
              </label>

              {doctorsList.length > 0 && (
                <select
                  value={selectedDoctorId}
                  onChange={(e) => handleDoctorSelect(e.target.value)}
                  className="select text-[12px] mb-1.5"
                >
                  <option value="">— Select from Doctor Registry —</option>
                  {doctorsList.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.regNo})
                    </option>
                  ))}
                </select>
              )}

              <input
                type="text"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="Dr. Name (e.g. Dr. Sharma)"
                className={`input text-[13px] ${isComplianceMandatory && !doctorName.trim() ? "!border-amber-400 !bg-amber-50/20" : ""}`}
              />

              {/* Optional Medical Representative / Broker */}
              {medicalRepsList.length > 0 && (
                <select
                  value={selectedMedicalRepId}
                  onChange={(e) => setSelectedMedicalRepId(e.target.value)}
                  className="select text-[12px] mt-1.5"
                >
                  <option value="">— Medical Rep / Consultant (Optional) —</option>
                  {medicalRepsList.map((m) => (
                    <option key={m.id} value={m.id}>
                      MR: {m.name} {m.companyName ? `(${m.companyName})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Statutory Compliance Panel for Schedule H, H1, X, Narcotics */}
            {isComplianceMandatory && (
              <div className="rounded-xl bg-amber-50/60 border border-amber-200 p-2.5 space-y-2 mt-2">
                <div className="flex items-center justify-between text-amber-950 font-semibold text-[11px] uppercase tracking-wider">
                  <span className="flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                    Statutory Register Details
                  </span>
                  {isH1OrHigher && (
                    <span className="badge badge-danger !text-[9px] !px-1">Form 35 / H1</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10.5px] font-medium text-ink-600">
                      Council Reg No {isH1OrHigher && <span className="text-red-600 font-bold">*</span>}
                    </label>
                    <input
                      type="text"
                      placeholder="MCI-12345"
                      value={doctorRegNo}
                      onChange={(e) => setDoctorRegNo(e.target.value)}
                      className="input !h-7 text-[12px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] font-medium text-ink-600">Rx Slip / Ref No</label>
                    <input
                      type="text"
                      placeholder="Slip # / Ref"
                      value={prescriptionRef}
                      onChange={(e) => setPrescriptionRef(e.target.value)}
                      className="input !h-7 text-[12px] font-mono"
                    />
                  </div>
                </div>

                {isH1OrHigher && (
                  <div className="space-y-1.5 pt-1.5 border-t border-amber-200/60 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10.5px] font-medium text-ink-600">Patient Age & Gender</label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            placeholder="Age"
                            value={patientAge}
                            onChange={(e) => setPatientAge(e.target.value === "" ? "" : Number(e.target.value))}
                            className="input !h-7 text-[12px] w-14"
                          />
                          <select
                            value={patientGender}
                            onChange={(e) => setPatientGender(e.target.value)}
                            className="select !h-7 text-[12px] flex-1"
                          >
                            <option value="male">M</option>
                            <option value="female">F</option>
                            <option value="other">O</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10.5px] font-medium text-ink-600">Patient Full Address *</label>
                        <input
                          type="text"
                          placeholder="Street, City, Pin"
                          value={patientAddress}
                          onChange={(e) => setPatientAddress(e.target.value)}
                          className="input !h-7 text-[12px]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment & Net Payable Summary */}
          <div className="card p-4 flex-1 flex flex-col shadow-xs">
            <h3 className="font-semibold text-[13.5px] text-ink-900 border-b border-ink-150 pb-2 mb-3">
              Bill Breakdown
            </h3>

            <div className="space-y-2 text-[13px] flex-1">
              <div className="flex justify-between text-ink-600">
                <span>Subtotal (Gross)</span>
                <span className="num font-medium text-ink-800">{formatINR(totals.gross)}</span>
              </div>
              <div className="flex justify-between text-brand-700">
                <span>Discount</span>
                <span className="num font-medium">- {formatINR(totals.discount)}</span>
              </div>
              <div className="flex justify-between text-ink-600">
                <span>Taxable Value</span>
                <span className="num font-medium text-ink-800">{formatINR(totals.taxable)}</span>
              </div>
              <div className="flex justify-between text-ink-600">
                <span>GST (CGST + SGST)</span>
                <span className="num font-medium text-ink-800">
                  {formatINR(totals.cgst + totals.sgst + totals.igst)}
                </span>
              </div>
              {totals.roundOff !== 0 && (
                <div className="flex justify-between text-ink-600">
                  <span>Round Off</span>
                  <span className="num font-medium">
                    {totals.roundOff > 0 ? "+" : ""}
                    {formatINR(totals.roundOff)}
                  </span>
                </div>
              )}

              <div className="pt-3 mt-3 border-t border-ink-150">
                <div className="flex justify-between items-baseline">
                  <span className="text-[14px] font-semibold text-ink-900">Net Payable</span>
                  <span className="text-2xl font-black text-brand-700 num">{formatINR(netPayable)}</span>
                </div>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="mt-4 pt-3 border-t border-ink-150 space-y-3">
              <div>
                <label className="label text-[12px] mb-1.5">Payment Method</label>
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("cash")}
                    className={`btn btn-sm justify-center !px-1 text-[12px] ${
                      paymentMethod === "cash"
                        ? "btn-primary !bg-brand-600 !text-white"
                        : "btn-secondary text-ink-700"
                    }`}
                  >
                    <Banknote className="h-3.5 w-3.5 mr-1" /> Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("upi")}
                    className={`btn btn-sm justify-center !px-1 text-[12px] ${
                      paymentMethod === "upi"
                        ? "btn-primary !bg-brand-600 !text-white"
                        : "btn-secondary text-ink-700"
                    }`}
                  >
                    <QrCode className="h-3.5 w-3.5 mr-1" /> UPI
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("card")}
                    className={`btn btn-sm justify-center !px-1 text-[12px] ${
                      paymentMethod === "card"
                        ? "btn-primary !bg-brand-600 !text-white"
                        : "btn-secondary text-ink-700"
                    }`}
                  >
                    <CreditCard className="h-3.5 w-3.5 mr-1" /> Card
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (cart.length > 0) {
                        setSplitCash((netPayable / 100).toString());
                        setSplitUpi("");
                        setSplitCard("");
                        setSplitError("");
                        setIsSplitModalOpen(true);
                      }
                    }}
                    className="btn btn-sm btn-secondary justify-center text-ink-700 hover:text-brand-700 !px-1 text-[11.5px]"
                    title="Split Tender & Store Credit (F8)"
                  >
                    <Layers className="h-3.5 w-3.5 mr-1" /> Split (F8)
                  </button>
                </div>
              </div>

              {state?.error && (
                <div className="p-2.5 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {state.error}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending || cart.length === 0}
                className="btn btn-primary w-full !py-3.5 !text-[15px] font-bold shadow-md shadow-brand-600/20"
              >
                <Printer className="h-4 w-4 mr-2" />
                {isPending ? "Generating Invoice..." : `Complete & Print (${formatINR(netPayable)})`}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ──────────────── Modal 1: Quick Customer Add (F4) ──────────────── */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="card w-full max-w-sm p-5 space-y-4 shadow-pop animate-enter">
            <div className="flex items-center justify-between border-b border-ink-150 pb-3">
              <h3 className="card-title flex items-center gap-2">
                <User className="h-4 w-4 text-brand-600" />
                Quick Add Customer
              </h3>
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="btn btn-secondary btn-icon !h-7 !w-7"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleQuickCustomerSave} className="space-y-3">
              <div>
                <label className="label text-[12.5px]">Patient / Customer Name *</label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="input"
                />
              </div>

              <div>
                <label className="label text-[12.5px]">Mobile Phone (for WhatsApp bill)</label>
                <input
                  type="tel"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="input"
                />
              </div>

              {custModalError && (
                <div className="text-[12px] text-red-600 bg-red-50 p-2 rounded border border-red-200">
                  {custModalError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCust}
                  className="btn btn-primary"
                >
                  {isSavingCust ? "Saving..." : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────── Modal 2: Molecule / Generic Substitute Finder ──────────────── */}
      {isSubstitutesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="card w-full max-w-2xl max-h-[85vh] flex flex-col shadow-pop animate-enter overflow-hidden">
            <div className="p-4 border-b border-ink-150 flex items-center justify-between bg-ink-50">
              <div>
                <h3 className="card-title flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-brand-600" />
                  Available Molecule Substitutes
                </h3>
                <p className="text-[12px] text-ink-500 font-mono mt-0.5">{substituteGeneric}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSubstitutesModalOpen(false)}
                className="btn btn-secondary btn-icon !h-7 !w-7"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {isLoadingSubstitutes ? (
                <div className="py-12 text-center text-ink-500 text-[13.5px]">
                  Searching stocked substitutes with this composition...
                </div>
              ) : substitutesList.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <PackageX className="h-10 w-10 text-ink-400 mx-auto stroke-[1.4]" />
                  <p className="text-[13.5px] font-semibold text-ink-800">No alternate brands currently in stock</p>
                  <p className="text-[12px] text-ink-500">
                    No active batches found matching composition “{substituteGeneric}”.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[12px] text-ink-600">
                    Found {substitutesList.length} substitute brand(s) with identical chemical formulation in stock:
                  </p>
                  <div className="divide-y divide-ink-150 border border-ink-200 rounded-lg overflow-hidden">
                    {substitutesList.map((sub) => (
                      <div key={sub.medicine.id} className="p-3 bg-white hover:bg-brand-50/30 transition-colors flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-ink-900 text-[13.5px]">{sub.medicine.name}</div>
                          <div className="text-[11.5px] text-ink-500 font-mono mt-0.5">
                            Total stock: <span className="font-bold text-ink-800">{sub.totalStock} units</span> across {sub.batches.length} batch(es)
                          </div>
                          <div className="flex gap-2 mt-1.5">
                            {sub.batches.slice(0, 2).map((b) => (
                              <span key={b.id} className="text-[11px] bg-ink-100 text-ink-700 px-1.5 py-0.5 rounded font-mono">
                                {b.batchNo} · Exp {new Date(b.expiryDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })} · {formatINR(b.saleRate || b.mrp)}
                              </span>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            addToCart(sub.medicine, sub.batches[0]);
                            setIsSubstitutesModalOpen(false);
                          }}
                          className="btn btn-primary btn-sm"
                        >
                          Add to Bill
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-ink-150 bg-ink-50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsSubstitutesModalOpen(false)}
                className="btn btn-secondary btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promise Order Modal */}
      {isPromiseModalOpen && promiseMed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSavePromiseOrder}
            className="card max-w-md w-full p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-ink-150">
              <div className="flex items-center gap-2">
                <BookmarkCheck className="h-5 w-5 text-brand-600" />
                <h3 className="text-sm font-bold text-ink-900">
                  Record Promise Order
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPromiseModalOpen(false)}
                className="btn btn-ghost btn-icon h-7 w-7"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-xs leading-relaxed">
              <span className="font-bold">{promiseMed.name}</span> is currently out of stock. Capture patient details to place supplier order and notify customer when stock arrives.
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="label">Patient / Customer Name *</label>
                <input
                  type="text"
                  value={promiseCustName}
                  onChange={(e) => setPromiseCustName(e.target.value)}
                  placeholder="e.g. Sunil Kumar"
                  className="input text-xs"
                  required
                />
              </div>

              <div>
                <label className="label">Mobile Number *</label>
                <input
                  type="tel"
                  value={promiseCustPhone}
                  onChange={(e) => setPromiseCustPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="input text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="label">Quantity Needed *</label>
                <input
                  type="number"
                  min="1"
                  value={promiseQty}
                  onChange={(e) => setPromiseQty(Number(e.target.value))}
                  className="input text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="label">Urgency / Instructions (Optional)</label>
                <textarea
                  value={promiseNotes}
                  onChange={(e) => setPromiseNotes(e.target.value)}
                  placeholder="e.g. Patient needs for post-op treatment"
                  rows={2}
                  className="input text-xs"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-ink-150 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPromiseModalOpen(false)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingPromise}
                className="btn btn-primary text-xs"
              >
                {isSavingPromise ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Save Promise Order
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ──────────────── Modal 4: Split Tender & Store Credit (F8) ──────────────── */}
      {isSplitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="card w-full max-w-lg p-5 space-y-4 shadow-pop animate-enter">
            <div className="flex items-center justify-between border-b border-ink-150 pb-3">
              <h3 className="card-title flex items-center gap-2">
                <Layers className="h-4 w-4 text-brand-600" />
                Split-Tender Payment (F8)
              </h3>
              <button
                type="button"
                onClick={() => setIsSplitModalOpen(false)}
                className="text-ink-400 hover:text-ink-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="bg-brand-50 p-3.5 rounded-lg border border-brand-200 flex justify-between items-center">
              <div>
                <span className="text-xs text-brand-700 font-semibold uppercase tracking-wider">Total Bill Amount</span>
                <p className="text-xs text-brand-600">{cart.length} items ({cart.reduce((a, b) => a + b.qty, 0)} units)</p>
              </div>
              <span className="text-2xl font-black text-brand-900 num">{formatINR(netPayable)}</span>
            </div>

            {/* Customer credit status info */}
            {(() => {
              const sel = customers.find((c) => c.id === customerId);
              if (sel) {
                return (
                  <div className="p-2.5 rounded-lg bg-ink-50 border border-ink-200 text-xs flex justify-between items-center">
                    <div>
                      <span className="font-semibold text-ink-900">Customer: {sel.name}</span>
                      <span className="text-ink-500 block text-[11px]">{sel.phone || "No phone"}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-ink-500 text-[11px] block">Credit Limit</span>
                      <span className="font-bold num text-ink-800">{formatINR(sel.creditLimit ?? 0)}</span>
                    </div>
                  </div>
                );
              }
              return (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>Walk-in customer selected. Any unpaid balance requires selecting a registered customer for store credit.</span>
                </div>
              );
            })()}

            {/* Split Tender Inputs */}
            <div className="space-y-3">
              <div>
                <label className="label text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Banknote className="h-3.5 w-3.5 text-emerald-600" /> Cash Tendered (₹)
                  </span>
                  <span className="text-[11px] text-ink-500">Overpayment returns change</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={splitCash}
                  onChange={(e) => setSplitCash(e.target.value)}
                  className="input font-mono font-bold text-sm"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs flex items-center gap-1.5">
                    <QrCode className="h-3.5 w-3.5 text-indigo-600" /> UPI Received (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={splitUpi}
                    onChange={(e) => setSplitUpi(e.target.value)}
                    className="input font-mono font-bold text-sm"
                  />
                </div>

                <div>
                  <label className="label text-xs flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 text-blue-600" /> Card / POS (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={splitCard}
                    onChange={(e) => setSplitCard(e.target.value)}
                    className="input font-mono font-bold text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Live calculation banner */}
            {(() => {
              const cashPaise = Math.round((parseFloat(splitCash) || 0) * 100);
              const upiPaise = Math.round((parseFloat(splitUpi) || 0) * 100);
              const cardPaise = Math.round((parseFloat(splitCard) || 0) * 100);
              const tenderedTotal = cashPaise + upiPaise + cardPaise;
              let changeDue = 0;
              let overpaidNonCash = false;

              if (tenderedTotal > netPayable) {
                const excess = tenderedTotal - netPayable;
                if (excess > cashPaise) {
                  overpaidNonCash = true;
                } else {
                  changeDue = excess;
                }
              }

              const paidAmount = Math.min(tenderedTotal - changeDue, netPayable);
              const creditAmount = Math.max(0, netPayable - paidAmount);
              const sel = customers.find((c) => c.id === customerId);

              return (
                <div className="space-y-2 pt-2 border-t border-ink-150">
                  <div className="flex justify-between text-xs text-ink-600">
                    <span>Total Tendered:</span>
                    <span className="font-mono font-bold text-ink-900">{formatINR(tenderedTotal)}</span>
                  </div>

                  {changeDue > 0 && (
                    <div className="flex justify-between items-center p-2 rounded bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
                      <span>Change to Return (Cash):</span>
                      <span className="font-mono text-sm font-bold text-emerald-900">{formatINR(changeDue)}</span>
                    </div>
                  )}

                  {creditAmount > 0 && (
                    <div className={`flex justify-between items-center p-2 rounded border text-xs font-semibold ${
                      !customerId
                        ? "bg-rose-50 border-rose-300 text-rose-800"
                        : (sel?.creditLimit ?? 0) <= 0
                        ? "bg-amber-50 border-amber-300 text-amber-800"
                        : "bg-blue-50 border-blue-300 text-blue-900"
                    }`}>
                      <span>Balance to Credit Ledger:</span>
                      <span className="font-mono text-sm font-bold">{formatINR(creditAmount)}</span>
                    </div>
                  )}

                  {overpaidNonCash && (
                    <div className="p-2 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                      Only cash can be overpaid. The total of UPI and Card exceeds the bill amount.
                    </div>
                  )}

                  {splitError && (
                    <div className="p-2 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
                      {splitError}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 pt-3 border-t border-ink-150">
              <button
                type="button"
                onClick={() => setIsSplitModalOpen(false)}
                className="btn btn-secondary text-xs"
              >
                Cancel (Esc)
              </button>
              <button
                type="button"
                disabled={isSubmittingSplit}
                onClick={handleSplitCheckout}
                className="btn btn-primary text-xs font-bold"
              >
                {isSubmittingSplit ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Printer className="h-3.5 w-3.5 mr-1" />
                    Complete & Print
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
