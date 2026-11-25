import React from "react";
import { getAllHelpArticles } from "@/server/domain/help/catalog";
import { HelpSearchClient } from "./_components/HelpSearchClient";

export const metadata = {
  title: "Help Center & Task Guides | MediFlow",
  description: "Standard operating procedures and interactive guides for pharmacy operations, counter billing, GST filing, and offline continuity.",
};

export default function HelpPage() {
  const articles = getAllHelpArticles();

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-primary-150 bg-gradient-to-r from-primary-50/70 to-emerald-50/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink-900">
            MediFlow Counter & Back-Office Playbook
          </h2>
          <span className="inline-flex items-center rounded-full bg-white/80 border border-primary-200 px-2.5 py-0.5 text-[11px] font-semibold text-primary-700">
            {articles.length} SOP Guides
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-600 max-w-3xl leading-relaxed">
          Step-by-step task guides covering POS counter billing, AI Stock &amp; Bill OCR, custom HTML invoice templates, Ask MediFlow AI (Ctrl+J), purchasing &amp; accounting, WhatsApp reminders, GST &amp; Drugs &amp; Cosmetics compliance, and offline continuity.
        </p>
      </div>

      <HelpSearchClient initialArticles={articles} />
    </div>
  );
}

