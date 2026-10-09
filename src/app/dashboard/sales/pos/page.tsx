"use client";

import { useState, useRef, useEffect, useActionState } from "react";
import { searchPosItems, createSaleInvoice, PosItemInput } from "@/app/actions/sales";
import { getCustomers } from "@/app/actions/customers";
import { computeSaleTotals } from "@/lib/money";
import { Search, ShoppingCart, User, Stethoscope, ArrowLeft, Trash2, Printer, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

interface SearchResult {
  medicine: { id: string; name: string; gstRateBp: number };
  batches: { id: string; batchNo: string; expiryDate: string; qtyOnHand: number; mrp: number; saleRate?: number }[];
}

export default function POSPage() {
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [customerId, setCustomerId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  
  const [cart, setCart] = useState<(PosItemInput & { medicineName: string; batchNo: string; mrp: number; qtyOnHand: number; gstRateBp: number })[]>([]);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCustomers().then(setCustomers);
    // Focus search on mount
    if (searchInputRef.current) searchInputRef.current.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus search on Ctrl+F or F3
      if ((e.ctrlKey && e.key === 'f') || e.key === 'F3') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    
    const handleAiAdd = (e: Event) => {
       const detail = (e as CustomEvent).detail;
       if (detail) {
         setCart(c => {
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
       }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("ai-add-to-bill", handleAiAdd);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("ai-add-to-bill", handleAiAdd);
    };
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery || searchQuery.length < 2) return;
    
    setIsSearching(true);
    try {
      const results = await searchPosItems(searchQuery);
      setSearchResults(results as SearchResult[]);
    } finally {
      setIsSearching(false);
    }
  };

  const addToCart = (medicine: SearchResult["medicine"], batch: SearchResult["batches"][0]) => {
    // Check if already in cart
    const existingIndex = cart.findIndex(c => c.batchId === batch.id);
    if (existingIndex >= 0) {
      const newCart = [...cart];
      if (newCart[existingIndex].qty < batch.qtyOnHand) {
        newCart[existingIndex].qty += 1;
        setCart(newCart);
      }
    } else {
      setCart([...cart, {
        medicineId: medicine.id,
        batchId: batch.id,
        medicineName: medicine.name,
        batchNo: batch.batchNo,
        qty: 1,
        qtyOnHand: batch.qtyOnHand,
        mrp: batch.mrp,
        rate: batch.saleRate || batch.mrp, // inclusive rate
        discountBp: 0,
        gstRateBp: medicine.gstRateBp,
      }]);
    }
    setSearchQuery("");
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  const updateCartQty = (index: number, newQty: number) => {
    const newCart = [...cart];
    if (newQty > 0 && newQty <= newCart[index].qtyOnHand) {
      newCart[index].qty = newQty;
      setCart(newCart);
    }
  };

  const updateCartDiscount = (index: number, discountPercent: number) => {
    const newCart = [...cart];
    newCart[index].discountBp = discountPercent * 100;
    setCart(newCart);
  };

  const removeCartItem = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const totals = computeSaleTotals(cart.map(c => ({
    qty: c.qty,
    rate: c.rate,
    discountBp: c.discountBp,
    gstRateBp: c.gstRateBp,
  })));

  const netPayable = totals.total;

  const [state, formAction, isPending] = useActionState(async (prevState: { error?: string; success?: boolean } | null, formData: FormData) => {
    if (cart.length === 0) return { error: "Cart is empty" };
    // Assuming full payment for retail POS
    const res = await createSaleInvoice(customerId, doctorName, cart, paymentMethod, netPayable);
    if (res.success) redirect(`/dashboard/sales/${res.saleId}/print`);
    return res;
  }, null);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6">
      {/* Left side: Search & Cart */}
      <div className="flex-1 flex flex-col space-y-4 h-full">
        <div className="flex items-center space-x-4">
          <Link href="/dashboard/sales" className="p-2 bg-white rounded-full shadow-sm hover:bg-slate-50 border border-slate-200">
            <ArrowLeft className="h-5 w-5 text-slate-600" />
          </Link>
          <h1 className="text-xl font-bold text-slate-900">Point of Sale</h1>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
          <form onSubmit={handleSearch} className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="block w-full pl-10 pr-24 py-3 border border-slate-300 rounded-xl focus:ring-brand-500 focus:border-brand-500 text-lg transition-colors"
              placeholder="F3 to search medicines or scan barcode..."
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute inset-y-1.5 right-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 rounded-lg font-medium transition-colors"
            >
              Search
            </button>
          </form>

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto bg-white absolute z-10 w-full shadow-xl" style={{ maxWidth: 'calc(100% - 2rem)' }}>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 font-medium">Medicine</th>
                    <th className="px-4 py-2 font-medium">Batch / Exp</th>
                    <th className="px-4 py-2 font-medium">Stock</th>
                    <th className="px-4 py-2 font-medium">Price</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {searchResults.map((res) => 
                    res.batches.map((batch: SearchResult["batches"][0]) => (
                      <tr 
                        key={`${res.medicine.id}-${batch.id}`} 
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => addToCart(res.medicine, batch)}
                      >
                        <td className="px-4 py-2 font-medium text-slate-900">{res.medicine.name}</td>
                        <td className="px-4 py-2 text-slate-600">
                          {batch.batchNo} <br/> <span className="text-xs text-slate-400">{new Date(batch.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-bold">{batch.qtyOnHand}</span>
                        </td>
                        <td className="px-4 py-2 text-slate-900 font-medium">₹{(batch.mrp / 100).toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); addToCart(res.medicine, batch); }}
                            className="bg-brand-50 text-brand-700 hover:bg-brand-100 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                          >
                            Add
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Cart Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-semibold text-slate-800 flex items-center">
              <ShoppingCart className="h-5 w-5 mr-2 text-brand-600" />
              Current Bill
            </h3>
            <span className="text-sm font-medium text-slate-500">{cart.length} Items</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                <ShoppingCart className="h-12 w-12 mb-4 opacity-20" />
                <p>Search for medicines to add them to the bill.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-white text-slate-500 sticky top-0 border-b border-slate-100 shadow-sm z-0">
                  <tr>
                    <th className="px-4 py-3 font-medium">Item</th>
                    <th className="px-4 py-3 font-medium w-24">Qty</th>
                    <th className="px-4 py-3 font-medium">Rate</th>
                    <th className="px-4 py-3 font-medium w-24">Disc %</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {cart.map((item, index) => {
                    return (
                      <tr key={index} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{item.medicineName}</div>
                          <div className="text-xs text-slate-500">Batch: {item.batchNo}</div>
                        </td>
                        <td className="px-4 py-3">
                          <input 
                            type="number" 
                            min="1" 
                            max={item.qtyOnHand}
                            value={item.qty}
                            onChange={(e) => updateCartQty(index, parseInt(e.target.value) || 1)}
                            className="w-16 px-2 py-1 border border-slate-200 rounded focus:ring-brand-500 text-center font-medium"
                          />
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          ₹{(item.rate / 100).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <input 
                            type="number" 
                            min="0" 
                            max="100"
                            value={item.discountBp / 100}
                            onChange={(e) => updateCartDiscount(index, parseFloat(e.target.value) || 0)}
                            className="w-16 px-2 py-1 border border-slate-200 rounded focus:ring-brand-500 text-center"
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          ₹{(totals.lines[index].total / 100).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => removeCartItem(index)} className="text-red-400 hover:text-red-600 p-1">
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

      {/* Right side: Checkout & Payment */}
      <div className="w-full md:w-96 flex flex-col gap-4">
        <form action={formAction} className="flex flex-col h-full gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
            <h3 className="font-semibold text-slate-800 border-b border-slate-100 pb-2">Customer & Doctor</h3>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center">
                <User className="h-3 w-3 mr-1" /> Customer (Optional)
              </label>
              <select
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-brand-500 text-sm bg-slate-50 hover:bg-white transition-colors"
              >
                <option value="">Walk-in Customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center">
                <Stethoscope className="h-3 w-3 mr-1" /> Prescribed By (Optional)
              </label>
              <input
                type="text"
                value={doctorName}
                onChange={e => setDoctorName(e.target.value)}
                placeholder="Dr. Name"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-brand-500 text-sm bg-slate-50 hover:bg-white transition-colors"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex-1 flex flex-col">
            <h3 className="font-semibold text-slate-800 border-b border-slate-100 pb-2 mb-4">Payment Summary</h3>
            
            <div className="space-y-3 text-sm flex-1">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>₹{(totals.gross / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-brand-600">
                <span>Discount</span>
                <span>- ₹{(totals.discount / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Taxable Amount</span>
                <span>₹{(totals.taxable / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>GST (Incl.)</span>
                <span>₹{((totals.cgst + totals.sgst + totals.igst) / 100).toFixed(2)}</span>
              </div>
              {totals.roundOff !== 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Round Off</span>
                  <span>{totals.roundOff > 0 ? '+' : '-'} ₹{(Math.abs(totals.roundOff) / 100).toFixed(2)}</span>
                </div>
              )}
              
              <div className="pt-4 mt-4 border-t border-slate-100">
                <div className="flex justify-between items-end">
                  <span className="text-base font-semibold text-slate-900">Net Payable</span>
                  <span className="text-3xl font-black text-brand-600">₹{(netPayable / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => setPaymentMethod('cash')} className={`py-2 text-sm font-medium rounded-lg border transition-all ${paymentMethod === 'cash' ? 'bg-brand-50 border-brand-200 text-brand-700 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Cash</button>
                  <button type="button" onClick={() => setPaymentMethod('upi')} className={`py-2 text-sm font-medium rounded-lg border transition-all ${paymentMethod === 'upi' ? 'bg-brand-50 border-brand-200 text-brand-700 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>UPI</button>
                  <button type="button" onClick={() => setPaymentMethod('card')} className={`py-2 text-sm font-medium rounded-lg border transition-all ${paymentMethod === 'card' ? 'bg-brand-50 border-brand-200 text-brand-700 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Card</button>
                </div>
              </div>

              {state?.error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg">
                  {state.error}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending || cart.length === 0}
                className="w-full flex items-center justify-center bg-brand-600 hover:bg-brand-700 text-white px-6 py-4 rounded-xl font-bold text-lg transition-all shadow-lg shadow-brand-500/30 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                <Printer className="h-5 w-5 mr-2" />
                {isPending ? "Processing..." : "Complete & Print"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
