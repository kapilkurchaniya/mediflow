"use client";

import { useEffect, useState, useRef } from "react";
import {
  Mic,
  Square,
  X,
  Send,
  Receipt,
  Package,
  Layers,
  Calendar,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  ShoppingBag,
  CheckCircle2,
} from "lucide-react";
import clsx from "clsx";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";

const SUGGESTIONS = ["Show low-stock items", "Today's sales summary", "Check interaction: Ibuprofen and Aspirin"];

/**
 * Pre-processes markdown text to ensure tables with collapsed/missing newlines
 * (e.g. `| Metric | Value | | :--- | :--- | | Row 1 | Val 1 |`)
 * are properly separated with standard newlines so remark-gfm parses them into rows.
 */
function formatMarkdownTables(text: string): string {
  if (!text) return "";
  // Fix collapsed table rows where `| |` was used instead of `|\n|`
  let formatted = text.replace(/\|\s*\|\s*/g, "|\n|");
  // Ensure tables have a newline before header if preceded by text
  formatted = formatted.replace(/([^\n])\n?(\| [^\n]+\|)/g, "$1\n\n$2");
  return formatted;
}

interface InvoiceItem {
  invoice_no: string;
  customer_name?: string;
  amount_rupees: string;
  payment_mode?: string;
}

interface BatchItem {
  batch_no: string;
  expiry_date: string;
  qty_on_hand: number;
  mrp_display: string;
}

interface MedicineStockItem {
  name: string;
  generic_composition?: string;
  pack_size?: string;
  stock_status?: string;
  total_stock_units: number;
  active_batches?: BatchItem[];
}

interface ToolInvocationRecord {
  toolName: string;
  result?: {
    error?: string;
    action?: string;
    payload?: unknown;
    invoices?: InvoiceItem[];
    medicines?: MedicineStockItem[];
    period?: string;
    date_range?: string;
    total_revenue_display?: string;
    total_invoices?: number;
    average_order_value_display?: string;
    total_credit_display?: string;
    cash_sales_display?: string;
    upi_sales_display?: string;
    card_sales_display?: string;
    total_purchases_display?: string;
    total_paid_display?: string;
    outstanding_display?: string;
    report_type?: string;
    stock_cost_value_display?: string;
    stock_sale_value_display?: string;
    total_items?: number;
    total_units?: number;
    items_in_stock?: number;
    low_stock_count?: number;
    items?: Array<{
      name: string;
      generic_composition?: string;
      total_stock: number;
      reorder_level: number;
      mrp_display?: string;
    }>;
  };
}

interface ToolInvocationPart {
  type: "tool-invocation";
  toolInvocation: {
    toolName: string;
    state: string;
    result?: unknown;
  };
}

/**
 * Custom styling for Markdown elements rendered in chat.
 */
const markdownComponents = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-2.5 max-w-full overflow-x-auto rounded-lg border border-ink-200 bg-white shadow-xs">
      <table className="w-full text-left text-[12px] border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-ink-50/90 border-b border-ink-150 text-[11px] font-semibold text-ink-600 uppercase tracking-wider">
      {children}
    </thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-3 py-2 text-ink-700 font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-2 border-b border-ink-100 last:border-b-0 text-ink-800">{children}</td>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="hover:bg-brand-50/20 transition-colors">{children}</tr>
  ),
  p: ({ children }: { children?: React.ReactNode }) => <p className="my-1.5 leading-relaxed text-[12.5px]">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-ink-900">{children}</strong>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="my-1.5 list-disc pl-4 space-y-1 text-[12px]">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="my-1.5 list-decimal pl-4 space-y-1 text-[12px]">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="text-[12px] text-ink-800">{children}</li>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="font-semibold text-[13px] text-ink-900 mt-2 mb-1">{children}</h3>,
  h4: ({ children }: { children?: React.ReactNode }) => <h4 className="font-medium text-[12.5px] text-ink-800 mt-2 mb-1">{children}</h4>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-ink-100/80 px-1 py-0.5 text-[11px] font-mono text-ink-800">{children}</code>
  ),
};

/**
 * Renders structured visual cards for specific tool results.
 */
function StructuredToolResult({ toolInvocation }: { toolInvocation: ToolInvocationRecord }) {
  const { toolName, result } = toolInvocation;
  if (!result || result.error) return null;

  // 1. Sales Summary Card
  if (toolName === "get_sales_summary") {
    return (
      <div className="my-2 rounded-xl border border-brand-200 bg-brand-50/30 p-3 shadow-xs text-ink-900">
        <div className="flex items-center justify-between border-b border-brand-100 pb-2 mb-2.5">
          <div className="flex items-center gap-1.5 font-semibold text-[13px] text-ink-900">
            <Receipt className="h-4 w-4 text-brand-600" />
            <span>Sales Summary</span>
          </div>
          <span className="badge badge-brand !text-[10px] capitalize font-medium">{result.period || "Report"}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-lg bg-white p-2 border border-brand-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Total Revenue</span>
            <span className="text-[15px] font-bold text-brand-700">{result.total_revenue_display || "₹0.00"}</span>
          </div>
          <div className="rounded-lg bg-white p-2 border border-brand-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Invoices Raised</span>
            <span className="text-[15px] font-bold text-ink-900">{result.total_invoices ?? 0}</span>
          </div>
          <div className="rounded-lg bg-white p-2 border border-brand-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Avg Order Value</span>
            <span className="text-[12.5px] font-semibold text-ink-800">{result.average_order_value_display || "₹0.00"}</span>
          </div>
          <div className="rounded-lg bg-white p-2 border border-brand-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Credit Due</span>
            <span className="text-[12.5px] font-semibold text-ink-800">{result.total_credit_display || "₹0.00"}</span>
          </div>
        </div>

        <div className="mt-2.5 pt-2 border-t border-brand-100/60 flex items-center justify-between text-[11px]">
          <span className="text-ink-400">Period: {result.date_range}</span>
          <Link href="/dashboard/sales" className="text-brand-600 font-medium hover:underline inline-flex items-center gap-0.5">
            View bills <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    );
  }

  // 2. Sales Details (Invoice List) Card
  if (toolName === "get_sales_details" && Array.isArray(result.invoices)) {
    return (
      <div className="my-2 rounded-xl border border-ink-150 bg-white p-3 shadow-xs">
        <div className="flex items-center justify-between border-b border-ink-100 pb-2 mb-2">
          <div className="flex items-center gap-1.5 font-semibold text-[13px] text-ink-900">
            <Receipt className="h-4 w-4 text-brand-600" />
            <span>Invoices</span>
          </div>
          <span className="text-[11px] text-ink-500 font-medium">{result.invoices.length} found</span>
        </div>

        <div className="divide-y divide-ink-100 max-h-48 overflow-y-auto">
          {(result.invoices || []).map((inv, idx: number) => (
            <div key={idx} className="py-2 flex items-center justify-between text-[12px]">
              <div>
                <span className="font-mono font-medium text-ink-900">{inv.invoice_no}</span>
                <span className="block text-[11px] text-ink-500">{inv.customer_name}</span>
              </div>
              <div className="text-right">
                <span className="font-semibold text-ink-900">{inv.amount_rupees}</span>
                <span className="block text-[10.5px] text-ink-400 capitalize">{inv.payment_mode || "paid"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 3. Stock Details Card
  if (toolName === "get_stock_details" && Array.isArray(result.medicines)) {
    return (
      <div className="my-2 space-y-2">
        {result.medicines.map((med, idx: number) => {
          const isOut = med.stock_status === "OUT_OF_STOCK";
          const isLow = med.stock_status === "LOW_STOCK";
          return (
            <div key={idx} className="rounded-xl border border-ink-150 bg-white p-3 shadow-xs text-ink-900">
              <div className="flex items-start justify-between gap-2 border-b border-ink-100 pb-2 mb-2">
                <div>
                  <h4 className="font-semibold text-[13px] text-ink-900 leading-tight">{med.name}</h4>
                  <p className="text-[11px] text-ink-500">{med.generic_composition} · {med.pack_size}</p>
                </div>
                <span
                  className={clsx(
                    "badge !text-[10px] shrink-0",
                    isOut ? "badge-danger" : isLow ? "badge-warning" : "badge-success"
                  )}
                >
                  {isOut ? "Out of Stock" : isLow ? "Low Stock" : "In Stock"}
                </span>
              </div>

              <div className="flex items-center justify-between mb-2 text-[12px]">
                <span className="text-ink-600">Available Stock:</span>
                <span className="font-bold text-[14px] text-ink-900 num">{med.total_stock_units} units</span>
              </div>

              {med.active_batches && med.active_batches.length > 0 && (
                <div className="rounded-lg border border-ink-100 overflow-hidden text-[11px] bg-ink-50/40">
                  <div className="grid grid-cols-4 bg-ink-100/70 px-2 py-1 font-semibold text-ink-600">
                    <span>Batch</span>
                    <span>Expiry</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">MRP</span>
                  </div>
                  {med.active_batches.map((b, bIdx: number) => (
                    <div key={bIdx} className="grid grid-cols-4 px-2 py-1 border-t border-ink-100 text-ink-700">
                      <span className="font-mono font-medium">{b.batch_no}</span>
                      <span>{b.expiry_date}</span>
                      <span className="text-right font-semibold">{b.qty_on_hand}</span>
                      <span className="text-right">{b.mrp_display}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // 4. Purchase Summary Card
  if (toolName === "get_purchase_summary") {
    return (
      <div className="my-2 rounded-xl border border-blue-200 bg-blue-50/30 p-3 shadow-xs text-ink-900">
        <div className="flex items-center justify-between border-b border-blue-100 pb-2 mb-2.5">
          <div className="flex items-center gap-1.5 font-semibold text-[13px] text-ink-900">
            <ShoppingBag className="h-4 w-4 text-blue-600" />
            <span>Purchase Summary</span>
          </div>
          <span className="badge badge-neutral !text-[10px] capitalize font-medium">{result.period || "Report"}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-lg bg-white p-2 border border-blue-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Total Purchases</span>
            <span className="text-[15px] font-bold text-blue-700">{result.total_purchases_display || "₹0.00"}</span>
          </div>
          <div className="rounded-lg bg-white p-2 border border-blue-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Invoices</span>
            <span className="text-[15px] font-bold text-ink-900">{result.total_invoices ?? 0}</span>
          </div>
          <div className="rounded-lg bg-white p-2 border border-blue-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Amount Paid</span>
            <span className="text-[12.5px] font-semibold text-ink-800">{result.total_paid_display || "₹0.00"}</span>
          </div>
          <div className="rounded-lg bg-white p-2 border border-blue-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Outstanding</span>
            <span className="text-[12.5px] font-semibold text-ink-800">{result.outstanding_display || "₹0.00"}</span>
          </div>
        </div>

        <div className="mt-2.5 pt-2 border-t border-blue-100/60 flex items-center justify-between text-[11px]">
          <span className="text-ink-400">Period: {result.date_range}</span>
          <Link href="/dashboard/purchases" className="text-blue-600 font-medium hover:underline inline-flex items-center gap-0.5">
            View GRNs <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    );
  }

  // 5. Stock Report Card (Valuation / Low stock)
  if (toolName === "get_stock_report") {
    if (result.report_type === "summary" || result.report_type === "value") {
      return (
        <div className="my-2 rounded-xl border border-ink-150 bg-white p-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-ink-100 pb-2 mb-2.5">
            <div className="flex items-center gap-1.5 font-semibold text-[13px] text-ink-900">
              <Layers className="h-4 w-4 text-brand-600" />
              <span>Inventory Valuation</span>
            </div>
            <span className="badge badge-brand !text-[10px]">Active Stock</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-lg bg-ink-50/70 p-2 border border-ink-100">
              <span className="text-[10.5px] text-ink-500 block">Stock Cost (PTR)</span>
              <span className="text-[14px] font-bold text-ink-900">{result.stock_cost_value_display}</span>
            </div>
            <div className="rounded-lg bg-ink-50/70 p-2 border border-ink-100">
              <span className="text-[10.5px] text-ink-500 block">Retail Value (MRP)</span>
              <span className="text-[14px] font-bold text-brand-700">{result.stock_sale_value_display}</span>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-ink-500">
            <span>Catalogue: {result.total_items} items ({result.total_units} units)</span>
            <Link href="/dashboard/inventory/batches" className="text-brand-600 hover:underline">
              Batches →
            </Link>
          </div>
        </div>
      );
    }
  }

  return null;
}

export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [input, setInput] = useState("");
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  const { messages, sendMessage, status } = useChat({});

  const isLoading = status === "submitted" || status === "streaming";
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll and event dispatch
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }

    // Check for tool results (e.g. POS add to bill)
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "assistant" && lastMessage.parts) {
      for (const p of lastMessage.parts) {
        if (p.type === "tool-invocation") {
          const inv = p as unknown as ToolInvocationPart;
          if (inv.toolInvocation?.state === "result") {
            const res = inv.toolInvocation.result as { action?: string; payload?: unknown } | undefined;
            if (res?.action === "DISPATCH_ADD_TO_BILL") {
              window.dispatchEvent(new CustomEvent("ai-add-to-bill", { detail: res.payload }));
            }
          }
        }
      }
    }
  }, [messages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setIsOpen((o) => !o);
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);

    // Initialize speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";

      rec.onresult = (event: SpeechRecognitionEvent) => {
        const text = event.results[0][0].transcript;
        setIsListening(false);
        sendMessage({ role: "user", parts: [{ type: "text", text }] });
      };

      rec.onerror = () => {
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }

    return () => window.removeEventListener("keydown", onKey);
  }, [sendMessage]);

  const toggleListen = () => {
    if (!isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ role: "user", parts: [{ type: "text", text: input }] });
    setInput("");
  };

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
        aria-label="Open assistant"
        className={clsx(
          "fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 flex h-10 items-center gap-2 rounded-full bg-ink-900 pl-3 pr-3.5 text-[13px] font-medium text-white print:hidden",
          "shadow-[0_8px_24px_-6px_rgb(0_0_0_/_0.35)] ring-1 ring-white/10 transition-all duration-200 hover:bg-ink-800",
          isOpen && "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
        </span>
        Ask MediFlow
        <span className="ml-1 rounded border border-white/15 px-1 font-mono text-[10px] text-white/60">Ctrl J</span>
      </button>

      {/* Panel */}
      <div
        role="dialog"
        aria-label="MediFlow assistant"
        className={clsx(
          "fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-50 flex flex-col w-[calc(100vw-2rem)] sm:w-[440px] max-w-[440px] h-[min(580px,calc(100vh-5.5rem))] sm:h-[620px] origin-bottom-right overflow-hidden rounded-2xl border border-ink-150 bg-white print:hidden",
          "shadow-[var(--shadow-pop)] transition-all duration-200 ease-out",
          isOpen ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-ink-150 px-4 h-12 shrink-0 bg-white/80 backdrop-blur-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            <span className="text-[13px] font-semibold text-ink-900">Assistant</span>
            <span className="badge badge-neutral !h-5 !text-[10.5px]">Live Database</span>
          </div>
          <button onClick={() => setIsOpen(false)} className="btn btn-ghost btn-icon" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Chat History */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3.5 text-[13px]">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center text-center mt-6">
              <div
                onClick={toggleListen}
                role="button"
                className={clsx(
                  "relative grid h-14 w-14 shrink-0 place-items-center rounded-full transition-colors cursor-pointer mb-4",
                  isListening ? "bg-red-600 text-white" : "bg-ink-900 text-white hover:bg-ink-800",
                )}
              >
                {isListening && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/30" />}
                {isListening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-6 w-6" />}
              </div>
              <p className="font-semibold text-ink-900 mb-1 text-[14px]">
                {isListening ? "Listening..." : "How can I help you today?"}
              </p>
              <p className="text-[12px] text-ink-500 mb-6">
                Ask about sales, stock details, medicines, or tap a suggestion below.
              </p>

              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage({ role: "user", parts: [{ type: "text", text: s }] })}
                    className="rounded-lg border border-ink-150 bg-ink-50/70 px-3 py-1.5 text-[12px] text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-700 font-medium"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m: UIMessage) => {
              const isUser = m.role === "user";
              const textParts: string[] = [];
              const toolInvocations: ToolInvocationRecord[] = [];
              for (const p of m.parts) {
                if (p.type === "text" && "text" in p && typeof (p as { text: unknown }).text === "string") {
                  textParts.push((p as { text: string }).text);
                } else if (p.type === "tool-invocation") {
                  const inv = p as unknown as ToolInvocationPart;
                  if (inv.toolInvocation?.state === "result") {
                    toolInvocations.push(inv.toolInvocation as ToolInvocationRecord);
                  }
                }
              }
              const textContent = textParts.join("");

              return (
                <div
                  key={m.id}
                  className={clsx(
                    "flex flex-col gap-1 w-full",
                    isUser ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={clsx(
                      "rounded-2xl px-3.5 py-2.5",
                      isUser
                        ? "bg-brand-500 text-white rounded-br-sm max-w-[85%]"
                        : "bg-ink-50 border border-ink-120 text-ink-900 rounded-bl-sm w-full max-w-full shadow-2xs"
                    )}
                  >
                    {isUser ? (
                      <p className="text-[13px] leading-relaxed">{textContent}</p>
                    ) : (
                      <div className="space-y-2">
                        {/* 1. Render structured visual cards for tool invocations */}
                        {toolInvocations.map((ti, tiIdx) => (
                          <StructuredToolResult key={tiIdx} toolInvocation={ti} />
                        ))}

                        {/* 2. Render markdown text with remarkGfm support for tables */}
                        {textContent.trim().length > 0 ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {formatMarkdownTables(textContent)}
                          </ReactMarkdown>
                        ) : toolInvocations.length === 0 ? (
                          <span className="text-ink-400 italic text-[12px]">Fetching data...</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
            <div className="self-start bg-ink-50 border border-ink-120 text-ink-900 rounded-2xl rounded-bl-sm px-3.5 py-2.5 shadow-2xs">
              <div className="flex gap-1.5 items-center h-5">
                <span className="text-[12px] text-ink-500 mr-1 font-medium">MediFlow is thinking</span>
                <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-ink-150 bg-ink-50/60 px-3 py-2.5 shrink-0">
          <input
            className="input input-sm flex-1 !shadow-none bg-white border-ink-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none rounded-lg px-3 py-1.5 text-[13px]"
            placeholder="Type a command or question…"
            value={input}
            onChange={handleInputChange}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-500 text-white disabled:opacity-50 transition-opacity hover:bg-brand-600"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>
  );
}
