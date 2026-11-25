import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  FileSpreadsheet,
  Keyboard,
  Lock,
  Printer,
  Receipt,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  WifiOff,
} from "lucide-react";

const ROLE_WORKFLOWS = [
  {
    step: "01",
    role: "Counter & Pharmacists",
    headline: "Zero-friction checkout with clinical safety",
    points: [
      "Instant brand & generic search with rack location",
      "Automatic Schedule H / H1 / X prescription prompts",
      "80mm thermal, 58mm Bluetooth, or A4 GST printing",
    ],
  },
  {
    step: "02",
    role: "Store & Purchase Managers",
    headline: "Tight margin, reorder & expiry discipline",
    points: [
      "Velocity-based Reorder Suggestions & Central POs",
      "Cycle-count Stocktakes with variance approval",
      "Promise Orders & WhatsApp chronic refill reminders",
    ],
  },
  {
    step: "03",
    role: "Owners & Accountants",
    headline: "Audit-ready financials across every branch",
    points: [
      "Strict tenant & branch isolation with RBAC",
      "One-click CA Audit Pack (GSTR-1 JSON, 2B, Trial Balance)",
      "Ask MediFlow AI (Ctrl+J) for instant store answers",
    ],
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-ink-900 flex flex-col selection:bg-brand-100 selection:text-brand-900">
      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-ink-150/80 bg-white/85 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="h-8 w-8 rounded-lg bg-brand-600 group-hover:bg-brand-700 text-white flex items-center justify-center shadow-xs transition-colors">
              <Activity className="h-4 w-4" />
            </div>
            <span className="font-bold text-lg tracking-tight text-ink-900">
              MediFlow
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-ink-600">
            <a href="#features" className="hover:text-ink-900 transition-colors">
              Capabilities
            </a>
            <a href="#workflows" className="hover:text-ink-900 transition-colors">
              Workflows
            </a>
            <a href="#compliance" className="hover:text-ink-900 transition-colors">
              Compliance
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              href="/login"
              className="px-3.5 py-2 rounded-lg text-sm font-medium text-ink-700 hover:text-ink-900 hover:bg-ink-50 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold shadow-sm shadow-brand-600/20 transition-all"
            >
              Get Started
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-ink-150 bg-white">
          {/* Subtle Architectural Grid + Soft Top Glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_15%,#000_45%,transparent_100%)] opacity-60"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 right-0 h-[460px] w-[560px] rounded-full bg-gradient-to-br from-brand-100/60 via-emerald-50/40 to-transparent blur-3xl"
          />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
              {/* Left Editorial Copy */}
              <div className="lg:col-span-6 space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-brand-200/80 bg-brand-50/90 px-3 py-1 text-xs font-semibold text-brand-700 shadow-2xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-brand-600" />
                  <span>Pharmacy OS for Indian Retail &amp; Chains</span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-[3.35rem] font-extrabold tracking-tight text-ink-900 leading-[1.08]">
                  Run every counter, batch, and{" "}
                  <span className="text-brand-600">GST return</span> from one
                  fast workspace.
                </h1>

                <p className="text-base sm:text-lg text-ink-600 leading-relaxed max-w-xl">
                  Keyboard-first FEFO billing, AI invoice &amp; stock-sheet OCR,
                  Schedule H/H1 registers, double-entry accounting, and offline
                  continuity—crafted for busy pharmacy counters.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 text-sm font-semibold shadow-lg shadow-brand-600/20 hover:shadow-brand-600/30 transition-all"
                  >
                    Start Free Trial
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 text-ink-800 px-6 py-3 text-sm font-semibold shadow-2xs transition-colors"
                  >
                    Sign In to Store
                  </Link>
                </div>

                <div className="pt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-ink-500">
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    D&amp;C Rules 1945
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    GSTN v1.4 GSTR-1 &amp; 2B
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    Offline Counter Sync
                  </span>
                </div>
              </div>

              {/* Right Flagship Console Showcase */}
              <div className="lg:col-span-6 relative">
                <div className="rounded-2xl border border-ink-200/90 bg-white shadow-[0_24px_60px_-15px_rgba(15,23,42,0.12)] ring-1 ring-ink-900/5 overflow-hidden">
                  {/* Top Chrome */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-ink-150 bg-ink-50/70">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-white border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-800 shadow-2xs">
                        <Store className="h-3 w-3 text-brand-600" />
                        Main Store [MAIN]
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-200/80 px-2 py-1 text-[11px] font-medium text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Register Open
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-ink-400">
                      POS • F2
                    </span>
                  </div>

                  {/* Body */}
                  <div className="p-4 sm:p-5 space-y-3.5">
                    {/* Search Preview */}
                    <div className="flex items-center justify-between rounded-xl border border-ink-200 bg-ink-50/50 px-3 py-2 text-xs text-ink-500">
                      <span className="inline-flex items-center gap-2">
                        <Search className="h-3.5 w-3.5 text-ink-400" />
                        <span>Search medicine, generic or scan barcode…</span>
                      </span>
                      <kbd className="rounded bg-white border border-ink-200 px-1.5 py-0.5 text-[10px] font-mono text-ink-500">
                        F3
                      </kbd>
                    </div>

                    {/* Cart Rows */}
                    <div className="rounded-xl border border-ink-150 overflow-hidden">
                      <div className="grid grid-cols-12 gap-2 bg-ink-50/80 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500 border-b border-ink-150">
                        <div className="col-span-5">Medicine</div>
                        <div className="col-span-3">Batch / Exp</div>
                        <div className="col-span-2 text-center">Qty</div>
                        <div className="col-span-2 text-right">Amount</div>
                      </div>

                      <div className="divide-y divide-ink-100 text-xs">
                        <div className="grid grid-cols-12 gap-2 px-3.5 py-2.5 items-center">
                          <div className="col-span-5 min-w-0">
                            <div className="font-semibold text-ink-900 truncate">
                              Dolo 650mg Tablet
                            </div>
                            <div className="text-[10px] text-ink-500">
                              Rack A-12 • FEFO Auto
                            </div>
                          </div>
                          <div className="col-span-3 text-[11px] text-ink-600">
                            <div className="font-mono">DL2609</div>
                            <div className="text-[10px] text-ink-400">Exp 09/2028</div>
                          </div>
                          <div className="col-span-2 text-center">
                            <span className="inline-block rounded-md border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] font-medium text-ink-800">
                              2 strips
                            </span>
                          </div>
                          <div className="col-span-2 text-right font-semibold text-ink-900 tabular-nums">
                            ₹64.00
                          </div>
                        </div>

                        <div className="grid grid-cols-12 gap-2 px-3.5 py-2.5 items-center bg-amber-50/35">
                          <div className="col-span-5 min-w-0">
                            <div className="font-semibold text-ink-900 truncate">
                              Atorva 20mg Tab
                            </div>
                            <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              Rx • Sched H
                            </div>
                          </div>
                          <div className="col-span-3 text-[11px] text-ink-600">
                            <div className="font-mono">ATV2056</div>
                            <div className="text-[10px] text-ink-400">Exp 01/2029</div>
                          </div>
                          <div className="col-span-2 text-center">
                            <span className="inline-block rounded-md border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] font-medium text-ink-800">
                              1 strip
                            </span>
                          </div>
                          <div className="col-span-2 text-right font-semibold text-ink-900 tabular-nums">
                            ₹215.50
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Compliance + Summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/60 p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-emerald-900">
                            Schedule H Verified
                          </span>
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        </div>
                        <div className="text-[11px] text-emerald-800">
                          Dr. Ananya Rao (MCI-48210)
                        </div>
                        <div className="text-[10px] text-emerald-700">
                          Auto-logged to Form 65(9)(b)
                        </div>
                      </div>

                      <div className="rounded-xl border border-ink-150 bg-ink-50/60 p-3 space-y-1.5">
                        <div className="flex justify-between text-[11px] text-ink-600">
                          <span>Taxable + GST (12%)</span>
                          <span className="tabular-nums">₹279.50</span>
                        </div>
                        <div className="flex justify-between items-baseline border-t border-ink-200 pt-1.5">
                          <span className="text-xs font-semibold text-ink-800">
                            Total Payable
                          </span>
                          <span className="text-base font-bold text-ink-900 tabular-nums">
                            ₹280.00
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Footer Action */}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
                        <Printer className="h-3.5 w-3.5 text-ink-400" />
                        <span>80mm Thermal / A4 Custom HTML</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs">
                        <Receipt className="h-3.5 w-3.5" />
                        Finalize Bill (F10)
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Clean Proof Bar */}
        <section className="border-b border-ink-150 bg-ink-50/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
              <div className="space-y-1">
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-ink-900">
                  FEFO-First
                </div>
                <p className="text-xs text-ink-500 leading-relaxed">
                  Automatic nearest-expiry batch picking at checkout
                </p>
              </div>
              <div className="space-y-1">
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-ink-900">
                  AI Bill &amp; Stock OCR
                </div>
                <p className="text-xs text-ink-500 leading-relaxed">
                  Extract GRN invoices, stock PDFs &amp; receipt templates
                </p>
              </div>
              <div className="space-y-1">
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-ink-900">
                  GSTR-1 &amp; 2B
                </div>
                <p className="text-xs text-ink-500 leading-relaxed">
                  GSTN Offline Tool v1.4 JSON &amp; ITC matching built in
                </p>
              </div>
              <div className="space-y-1">
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-ink-900">
                  Zero Downtime
                </div>
                <p className="text-xs text-ink-500 leading-relaxed">
                  Offline counter billing with automatic cloud sync
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Bento Capabilities Grid */}
        <section id="features" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mb-12">
              <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-2">
                Platform Capabilities
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-ink-900">
                Everything a modern pharmacy needs — in one cohesive system
              </h2>
              <p className="mt-3 text-base text-ink-600">
                Purpose-built around retail pharmacy counters, distributor purchasing,
                and statutory Indian compliance.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-5">
              {/* Featured Card 1 */}
              <div className="md:col-span-3 rounded-2xl border border-ink-150 bg-gradient-to-br from-ink-50/60 to-white p-6 flex flex-col justify-between gap-6 hover:border-ink-250 hover:shadow-sm transition-all">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 text-brand-700 flex items-center justify-center">
                      <Keyboard className="h-5 w-5" />
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 bg-white border border-ink-150 rounded-md px-2 py-0.5">
                      POS &amp; Shifts
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-ink-900">
                    Keyboard-First POS Counter
                  </h3>
                  <p className="text-sm text-ink-600 leading-relaxed">
                    Bill packs or loose tablets in seconds with split tender (Cash, UPI,
                    Card, Credit, Loyalty), Hold/Park queues, and Shift X/Z-Reports.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-ink-150/80 text-[11px] font-medium text-ink-600">
                  <span className="rounded-md bg-white border border-ink-200 px-2 py-1 font-mono text-ink-800">
                    F2 New
                  </span>
                  <span className="rounded-md bg-white border border-ink-200 px-2 py-1 font-mono text-ink-800">
                    F3 Search
                  </span>
                  <span className="rounded-md bg-white border border-ink-200 px-2 py-1 font-mono text-ink-800">
                    F6 Hold
                  </span>
                  <span className="rounded-md bg-white border border-ink-200 px-2 py-1 font-mono text-ink-800">
                    F8 Split
                  </span>
                  <span className="rounded-md bg-brand-50 border border-brand-200 px-2 py-1 font-mono font-semibold text-brand-700">
                    F10 Print
                  </span>
                </div>
              </div>

              {/* Featured Card 2 */}
              <div className="md:col-span-3 rounded-2xl border border-ink-150 bg-gradient-to-br from-ink-50/60 to-white p-6 flex flex-col justify-between gap-6 hover:border-ink-250 hover:shadow-sm transition-all">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 text-brand-700 flex items-center justify-center">
                      <ScanLine className="h-5 w-5" />
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 bg-white border border-ink-150 rounded-md px-2 py-0.5">
                      AI OCR &amp; Templates
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-ink-900">
                    AI Invoice, Stock &amp; Bill OCR
                  </h3>
                  <p className="text-sm text-ink-600 leading-relaxed">
                    Scan supplier GRN bills, multi-page distributor PDFs, or physical
                    receipt photos into editable A4 and 80mm HTML templates.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-ink-150/80 text-[11px] font-medium text-ink-600">
                  <span className="rounded-md bg-white border border-ink-200 px-2.5 py-1">
                    Bill Photo / PDF
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-ink-400" />
                  <span className="rounded-md bg-white border border-ink-200 px-2.5 py-1">
                    AI Extract
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-ink-400" />
                  <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 font-semibold text-emerald-700">
                    Live A4 / 80mm Preview
                  </span>
                </div>
              </div>

              {/* Supporting Card 3 */}
              <div className="md:col-span-2 rounded-2xl border border-ink-150 bg-white p-6 space-y-3 hover:border-ink-250 hover:shadow-sm transition-all">
                <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 text-brand-700 flex items-center justify-center">
                  <Boxes className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-ink-900">
                  FEFO Batch &amp; Expiry Control
                </h3>
                <p className="text-sm text-ink-600 leading-relaxed">
                  90-day expiry alerts, Quarantine holds, cycle-count Stocktakes, and
                  inter-branch Expiry Redistribution.
                </p>
              </div>

              {/* Supporting Card 4 */}
              <div className="md:col-span-2 rounded-2xl border border-ink-150 bg-white p-6 space-y-3 hover:border-ink-250 hover:shadow-sm transition-all">
                <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 text-brand-700 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-ink-900">
                  Schedule H, H1 &amp; Narcotics
                </h3>
                <p className="text-sm text-ink-600 leading-relaxed">
                  Enforced prescriber capture at POS, Form 65(9)(b) registers, Drug License
                  alerts, and 1-click Inspector packs.
                </p>
              </div>

              {/* Supporting Card 5 */}
              <div className="md:col-span-2 rounded-2xl border border-ink-150 bg-white p-6 space-y-3 hover:border-ink-250 hover:shadow-sm transition-all">
                <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 text-brand-700 flex items-center justify-center">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-ink-900">
                  GST Filing &amp; Double-Entry
                </h3>
                <p className="text-sm text-ink-600 leading-relaxed">
                  Auto-posted Day Book vouchers, GSTR-2B ITC matching, Trial Balance,
                  P&amp;L, and GSTN v1.4 GSTR-1 JSON export.
                </p>
              </div>

              {/* Wide Bottom Strip */}
              <div className="md:col-span-6 rounded-2xl border border-ink-150 bg-ink-50/50 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-white border border-ink-200 text-brand-700 flex items-center justify-center shrink-0">
                    <WifiOff className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-ink-900">
                      Multi-Branch Sync, WhatsApp &amp; Offline Continuity
                    </h3>
                    <p className="text-sm text-ink-600">
                      Central POs, E-Way Bill transfers, automated WhatsApp refill
                      reminders, and zero-downtime offline billing.
                    </p>
                  </div>
                </div>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800 shrink-0"
                >
                  Explore in Workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Role-Based Workflows */}
        <section id="workflows" className="py-20 border-y border-ink-150 bg-ink-50/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mb-12">
              <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-2">
                Built for Every Role
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-ink-900">
                Faster at the counter, cleaner in the back office
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {ROLE_WORKFLOWS.map((group) => (
                <div
                  key={group.role}
                  className="rounded-2xl border border-ink-150 border-t-2 border-t-brand-600 bg-white p-6 space-y-4 shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                      {group.role}
                    </span>
                    <span className="text-xs font-mono font-semibold text-ink-400">
                      {group.step}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-ink-900 leading-snug">
                    {group.headline}
                  </h3>
                  <ul className="space-y-2.5 pt-1">
                    {group.points.map((pt) => (
                      <li
                        key={pt}
                        className="flex items-start gap-2.5 text-sm text-ink-600"
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Compliance & CTA Banner */}
        <section id="compliance" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center rounded-2xl bg-ink-900 text-white p-8 lg:p-12 ring-1 ring-ink-900/10 shadow-xl">
              <div className="lg:col-span-7 space-y-4">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  <Lock className="h-3.5 w-3.5" />
                  <span>Tenant-Isolated &amp; Audit-Grade</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  Ready for Drug Inspections, GST Audits, and Multi-Branch Scale
                </h2>
                <p className="text-sm sm:text-base text-ink-300 leading-relaxed max-w-2xl">
                  From immutable stock ledgers and Form 20/21/65(9)(b) exports to
                  automated Day Book postings and Ask MediFlow AI (Ctrl+J), every
                  workflow stays compliant by default.
                </p>
                <div className="pt-2 flex flex-wrap gap-3">
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white px-5 py-2.5 text-sm font-semibold transition-colors"
                  >
                    Create Pharmacy Workspace
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white px-5 py-2.5 text-sm font-semibold transition-colors"
                  >
                    Sign In
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-5 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-1.5">
                  <BarChart3 className="h-4 w-4 text-emerald-400" />
                  <div className="font-semibold text-white">Real-Time Ledger</div>
                  <div className="text-ink-300 leading-relaxed">
                    Day Book, Trial Balance, P&amp;L &amp; Balance Sheet
                  </div>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-1.5">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                  <div className="font-semibold text-white">Ask MediFlow AI</div>
                  <div className="text-ink-300 leading-relaxed">
                    Natural-language store &amp; expiry queries
                  </div>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-1.5">
                  <Printer className="h-4 w-4 text-emerald-400" />
                  <div className="font-semibold text-white">Custom Bill HTML</div>
                  <div className="text-ink-300 leading-relaxed">
                    Scan paper bills into A4 &amp; 80mm templates
                  </div>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-1.5">
                  <Store className="h-4 w-4 text-emerald-400" />
                  <div className="font-semibold text-white">Chain Transfers</div>
                  <div className="text-ink-300 leading-relaxed">
                    Central POs, Challans &amp; E-Way Bills
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-ink-150 bg-ink-50/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-500">
          <div className="flex items-center gap-2 font-medium text-ink-700">
            <Activity className="h-4 w-4 text-brand-600" />
            <span>MediFlow Pharmacy ERP</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="hover:text-ink-900 transition-colors">
              Capabilities
            </a>
            <a href="#workflows" className="hover:text-ink-900 transition-colors">
              Workflows
            </a>
            <Link href="/login" className="hover:text-ink-900 transition-colors">
              Sign In
            </Link>
            <Link href="/register" className="hover:text-ink-900 transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
