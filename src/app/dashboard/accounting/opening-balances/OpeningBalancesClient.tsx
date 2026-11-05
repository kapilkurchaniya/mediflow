"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Scale, Users, Truck, Package } from "lucide-react";
import type { OpeningBalancesSummary, PartyOpeningRow } from "@/server/domain/accounting-opening-balances";
import { OpeningBalancesOverview } from "./_components/OpeningBalancesOverview";
import { CustomerOpeningBalancesTable } from "./_components/CustomerOpeningBalancesTable";
import { SupplierOpeningBalancesTable } from "./_components/SupplierOpeningBalancesTable";
import { StockOpeningBalanceCard } from "./_components/StockOpeningBalanceCard";

interface StoreOption {
  id: string;
  name: string;
}

interface ClientProps {
  summary: OpeningBalancesSummary;
  customers: PartyOpeningRow[];
  suppliers: PartyOpeningRow[];
  stores: StoreOption[];
  isOwner: boolean;
}

export function OpeningBalancesClient({ summary, customers, suppliers, stores, isOwner }: ClientProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "customers" | "suppliers" | "inventory">("overview");
  const router = useRouter();

  function handleRefresh() {
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800 space-x-1">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "overview"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Scale className="w-4 h-4" />
          Overview & Equity
        </button>
        <button
          onClick={() => setActiveTab("customers")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "customers"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Users className="w-4 h-4" />
          Customers (1050)
        </button>
        <button
          onClick={() => setActiveTab("suppliers")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "suppliers"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Truck className="w-4 h-4" />
          Suppliers (2010)
        </button>
        <button
          onClick={() => setActiveTab("inventory")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "inventory"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Package className="w-4 h-4" />
          Opening Inventory (1080)
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <OpeningBalancesOverview summary={summary} isOwner={isOwner} onRefresh={handleRefresh} />
      )}
      {activeTab === "customers" && (
        <CustomerOpeningBalancesTable rows={customers} onRefresh={handleRefresh} />
      )}
      {activeTab === "suppliers" && (
        <SupplierOpeningBalancesTable rows={suppliers} onRefresh={handleRefresh} />
      )}
      {activeTab === "inventory" && (
        <StockOpeningBalanceCard stores={stores} onRefresh={handleRefresh} />
      )}
    </div>
  );
}
