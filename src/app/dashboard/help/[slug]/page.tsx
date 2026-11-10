import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  Tag,
  Printer,
  ExternalLink,
  HelpCircle,
  Sparkles,
  Info,
  CheckCircle2,
} from "lucide-react";
import { getHelpArticleBySlug, getAllHelpArticles } from "@/server/domain/help/catalog";

interface HelpArticlePageProps {
  params: Promise<{ slug: string }>;
}

export default async function HelpArticlePage({ params }: HelpArticlePageProps) {
  const { slug } = await params;
  const article = getHelpArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const relatedArticles = article.relatedSlugs
    .map((s) => getHelpArticleBySlug(s))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  return (
    <article className="space-y-8 max-w-4xl">
      {/* Top Navigation & Action Header */}
      <div className="space-y-4">
        <Link
          href="/dashboard/help"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to All Guides
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-ink-150 pb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-2.5 py-0.5 text-xs font-semibold text-ink-700 uppercase tracking-wider">
                <Tag className="h-3 w-3" />
                {article.category}
              </span>
              <div className="flex items-center gap-1 text-xs font-medium text-ink-500">
                <Clock className="h-3.5 w-3.5" />
                <span>{article.readMinutes} min read</span>
              </div>
              {article.badge && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-sm">
                  <Sparkles className="h-3 w-3" />
                  {article.badge}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-ink-900 tracking-tight">
              {article.title}
            </h1>
            <p className="text-sm text-ink-600 leading-relaxed max-w-2xl">
              {article.summary}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {article.actionRoute && (
              <Link
                href={article.actionRoute}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-primary-700"
              >
                <span>{article.actionLabel ?? "Open Screen"}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") window.print();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-medium text-ink-700 shadow-2xs hover:bg-ink-50 print:hidden"
            >
              <Printer className="h-3.5 w-3.5 text-ink-500" />
              Print Desk SOP
            </button>
          </div>
        </div>
      </div>

      {/* Target Role & Scope Banner */}
      <div className="flex items-center gap-2 rounded-lg border border-ink-150 bg-ink-50/60 px-4 py-2.5 text-xs text-ink-700">
        <Info className="h-4 w-4 text-ink-500 shrink-0" />
        <span>
          Target Audience: <strong className="font-semibold text-ink-900">{article.targetRole}</strong>.
          Designed for counter retail workflows and Indian regulatory parity.
        </span>
      </div>

      {/* Step by Step Walkthrough */}
      <section className="space-y-6">
        <h2 className="text-lg font-bold text-ink-900 tracking-tight">
          Step-by-Step Procedure
        </h2>

        <div className="space-y-4">
          {article.steps.map((step, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-ink-150 bg-white p-5 shadow-2xs space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  {step.title}
                </h3>
                {step.shortcutKey && (
                  <kbd className="kbd font-mono text-[11px] font-medium bg-ink-100 text-ink-700 px-2 py-0.5 rounded-md border border-ink-200 shrink-0">
                    {step.shortcutKey}
                  </kbd>
                )}
              </div>

              <p className="text-xs text-ink-600 leading-relaxed">
                {step.content}
              </p>

              {step.tip && (
                <div className="rounded-lg bg-emerald-50/60 border border-emerald-150 p-3 text-xs text-emerald-900 flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Pro-Tip:</strong> {step.tip}
                  </span>
                </div>
              )}

              {step.callout && (
                <div className="rounded-lg bg-amber-50/70 border border-amber-200 p-3 text-xs text-amber-900 flex items-start gap-2">
                  <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Statutory Note:</strong> {step.callout}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Frequently Asked Questions */}
      {article.faqs.length > 0 && (
        <section className="space-y-4 pt-4 border-t border-ink-150">
          <h2 className="text-base font-bold text-ink-900 flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary-600" />
            Frequently Asked Questions
          </h2>

          <div className="grid grid-cols-1 gap-3">
            {article.faqs.map((faq, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-ink-150 bg-ink-25/50 p-4 space-y-1.5"
              >
                <h4 className="text-xs font-semibold text-ink-900">
                  Q: {faq.q}
                </h4>
                <p className="text-xs text-ink-600 leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Related Guides Cross-Navigation */}
      {relatedArticles.length > 0 && (
        <section className="space-y-4 pt-4 border-t border-ink-150 print:hidden">
          <h2 className="text-xs font-semibold text-ink-500 uppercase tracking-wider">
            Related Task Guides
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {relatedArticles.map((rel) => (
              <Link
                key={rel.slug}
                href={`/dashboard/help/${rel.slug}`}
                className="flex items-center justify-between rounded-xl border border-ink-150 bg-white p-3.5 hover:border-ink-250 transition-all shadow-2xs group"
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-ink-900 group-hover:text-primary-600">
                    {rel.title}
                  </div>
                  <div className="text-[11px] text-ink-400">
                    {rel.readMinutes} min read · {rel.category}
                  </div>
                </div>
                <ArrowLeft className="h-3.5 w-3.5 rotate-180 text-ink-400 group-hover:text-primary-600 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

export async function generateStaticParams() {
  const articles = getAllHelpArticles();
  return articles.map((a) => ({ slug: a.slug }));
}
