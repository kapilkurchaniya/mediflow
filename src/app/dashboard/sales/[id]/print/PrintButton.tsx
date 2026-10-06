"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  return (
    <button 
      onClick={() => window.print()}
      className="flex items-center bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-md hover:shadow-lg active:scale-95"
    >
      <Printer className="w-5 h-5 mr-2" />
      Print Invoice
    </button>
  );
}
