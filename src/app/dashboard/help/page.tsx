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
        <h2 className="text-base font-semibold text-ink-900">
          MediFlow Counter & Back-Office Playbook
        </h2>
        <p className="mt-1 text-xs text-ink-600 max-w-2xl leading-relaxed">
          Step-by-step task guides designed for cashiers, pharmacists, and accountants running retail pharmacy chains.
          All workflows strictly adhere to the Drugs & Cosmetics Rules 1945 and GST Rules.
        </p>
      </div>

      <HelpSearchClient initialArticles={articles} />
    </div>
  );
}
