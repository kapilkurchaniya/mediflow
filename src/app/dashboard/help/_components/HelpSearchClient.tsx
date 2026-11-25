"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  BookOpen,
  ArrowRight,
  Clock,
  Sparkles,
  Tag,
  HelpCircle,
  FileText,
  Boxes,
  ShieldCheck,
  WifiOff,
  Receipt,
  Wand2,
} from "lucide-react";
import { type HelpArticle, type HelpCategory } from "@/server/domain/help/catalog";

interface HelpSearchClientProps {
  initialArticles: HelpArticle[];
}

const CATEGORY_LABELS: Record<HelpCategory, string> = {
  billing: "Counter Billing",
  inventory: "Stock & Transfers",
  purchasing: "Purchasing & Accounts",
  compliance: "GST & Compliance",
  "ai-tools": "AI, Printers & Channels",
  offline: "Offline Mode",
};

export function HelpSearchClient({ initialArticles }: HelpSearchClientProps) {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory | "all">("all");

  const categories: Array<{ id: HelpCategory | "all"; label: string; icon: React.ReactNode }> = [
    { id: "all", label: "All SOP Guides", icon: <BookOpen className="h-3.5 w-3.5" /> },
    { id: "billing", label: "Counter Billing", icon: <FileText className="h-3.5 w-3.5" /> },
    { id: "inventory", label: "Stock & Transfers", icon: <Boxes className="h-3.5 w-3.5" /> },
    { id: "purchasing", label: "Purchasing & Accounts", icon: <Receipt className="h-3.5 w-3.5" /> },
    { id: "compliance", label: "GST & Compliance", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
    { id: "ai-tools", label: "AI, Printers & Channels", icon: <Wand2 className="h-3.5 w-3.5" /> },
    { id: "offline", label: "Offline Mode", icon: <WifiOff className="h-3.5 w-3.5" /> },
  ];

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return initialArticles.filter((a) => {
      if (selectedCategory !== "all" && a.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [initialArticles, query, selectedCategory]);

  return (
    <div className="space-y-6">
      {/* Search Input Bar */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
          <Search className="h-4 w-4 text-ink-400" />
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search guides (e.g. 'first bill', 'ask mediflow', 'template ocr', 'grn', 'shift', 'gstr1', 'offline')..."
          className="w-full rounded-xl border border-ink-200 bg-white py-3 pl-10 pr-4 text-sm text-ink-900 placeholder:text-ink-400 shadow-2xs focus:border-primary-500 focus:outline-hidden focus:ring-2 focus:ring-primary-100"
        />
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-primary-600 text-white shadow-2xs"
                  : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 hover:text-ink-900"
              }`}
            >
              {cat.icon}
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Grid of Guide Cards */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-200 bg-white p-12 text-center">
          <HelpCircle className="mx-auto h-8 w-8 text-ink-300" />
          <h3 className="mt-2 text-sm font-semibold text-ink-800">No matching guides found</h3>
          <p className="mt-1 text-xs text-ink-500">
            Try adjusting your search query or switch back to &quot;All SOP Guides&quot;.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((guide) => (
            <article
              key={guide.slug}
              className="flex flex-col justify-between rounded-xl border border-ink-150 bg-white p-5 shadow-2xs transition-all hover:border-ink-250 hover:shadow-xs"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700 uppercase tracking-wider">
                    <Tag className="h-3 w-3" />
                    {CATEGORY_LABELS[guide.category]}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] font-medium text-ink-400">
                    <Clock className="h-3 w-3" />
                    <span>{guide.readMinutes}m read</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-[15px] font-semibold text-ink-900 leading-snug">
                    <Link
                      href={`/dashboard/help/${guide.slug}`}
                      className="hover:text-primary-600 transition-colors"
                    >
                      {guide.title}
                    </Link>
                  </h3>
                  <p className="mt-1.5 text-xs text-ink-500 leading-relaxed line-clamp-3">
                    {guide.summary}
                  </p>
                </div>

                {guide.badge && (
                  <div className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-sm">
                    <Sparkles className="h-3 w-3" />
                    {guide.badge}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-ink-100 flex items-center justify-between">
                <span className="text-[11px] text-ink-400">
                  Role: <strong className="font-semibold text-ink-700">{guide.targetRole}</strong>
                </span>

                <Link
                  href={`/dashboard/help/${guide.slug}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700"
                >
                  View Guide
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

