"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useShell } from "./ShellContext";
import { PALETTE_NAV_ITEMS } from "./nav";
import type { TooltipPlacement } from "./Tooltip";

interface TooltipData {
  title?: string;
  description: string;
  shortcut?: string;
  placement: TooltipPlacement;
  rect: DOMRect;
}

interface RouteMeta {
  title: string;
  description: string;
  shortcut?: string;
}

const STATIC_ROUTE_CATALOG: Record<string, RouteMeta> = {
  "/dashboard": {
    title: "Store Overview",
    description: "Real-time pharmacy revenue, low-stock alerts, near-expiry warnings & recent bills.",
  },
  "/dashboard/sales/pos": {
    title: "POS Billing Counter",
    description: "High-speed retail billing with barcode scan, FEFO batch selection & split tender.",
    shortcut: "F2",
  },
  "/dashboard/sales/promise-orders/new": {
    title: "New Promise Order",
    description: "Record a customer request for out-of-stock or special-order medicines.",
  },
  "/dashboard/sales/register/x-report/print": {
    title: "Print X-Report",
    description: "Print a mid-shift cash drawer snapshot without closing the active shift.",
  },
  "/dashboard/inventory/new": {
    title: "Add Medicine / Item",
    description: "Create a new item in the master catalog with salt composition, HSN, GST & schedule.",
  },
  "/dashboard/inventory/import": {
    title: "Import Stock CSV / Excel",
    description: "Bulk upload medicines and batch quantities from CSV, Excel or legacy ERP exports.",
  },
  "/dashboard/inventory/batches/new": {
    title: "Add Opening Stock Batch",
    description: "Enter a new batch with batch number, expiry date, MRP, purchase rate (PTR) & quantity.",
  },
  "/dashboard/inventory/stocktake/new": {
    title: "Start Physical Stocktake",
    description: "Begin a shelf-count audit session to reconcile physical quantities with system stock.",
  },
  "/dashboard/inventory/transfers/new": {
    title: "New Stock Transfer",
    description: "Dispatch medicine batches to another pharmacy branch or warehouse with a challan.",
  },
  "/dashboard/purchases/orders/new": {
    title: "Draft Purchase Order",
    description: "Create a new purchase order for a medicine wholesaler or distributor.",
  },
  "/dashboard/purchases/new": {
    title: "Record Purchase (GRN)",
    description: "Post a supplier purchase invoice (Goods Received Note) to add stock & update payables.",
  },
  "/dashboard/purchases/returns/new": {
    title: "New Purchase Return (Debit Note)",
    description: "Return damaged, slow or expired stock to a supplier and issue a GST debit note.",
  },
  "/dashboard/accounting/trial-balance": {
    title: "Trial Balance",
    description: "Verify that total debits equal total credits across all general ledger accounts.",
  },
  "/dashboard/accounting/profit-loss": {
    title: "Profit & Loss Statement",
    description: "Analyze gross sales revenue, Cost of Goods Sold (COGS), gross margin & net profit.",
  },
  "/dashboard/accounting/balance-sheet": {
    title: "Balance Sheet",
    description: "Inspect store assets, inventory valuation, liabilities, payables & owners' equity.",
  },
  "/dashboard/accounting/cash-flow": {
    title: "Cash Flow Statement",
    description: "Track cash drawer, UPI and bank inflows vs. supplier and expense outflows.",
  },
  "/dashboard/accounting/outstanding": {
    title: "Debtor & Creditor Ageing",
    description: "Track customer receivables and supplier payables across 0–30, 31–60, 61–90 & 90+ day buckets.",
  },
  "/dashboard/accounting/expenses/new": {
    title: "Record Operating Expense",
    description: "Post a store expense voucher (rent, electricity, till payout) to the double-entry ledger.",
  },
  "/dashboard/accounting/export": {
    title: "CA Month-End Audit Pack",
    description: "One-click Chartered Accountant export: GSTR-1 JSON, Inward ITC, Sales CSV & Stock Valuation.",
  },
  "/dashboard/compliance/schedule-h": {
    title: "Schedule H Drug Register",
    description: "Statutory dispensing log of Schedule H prescription drugs with patient & doctor details.",
  },
  "/dashboard/compliance/narcotics": {
    title: "Narcotics & Schedule X Register",
    description: "Strict regulatory dispensing register for NDPS / Schedule X psychotropic medicines.",
  },
  "/dashboard/compliance/export": {
    title: "Drug Inspector Compliance Pack",
    description: "Generate printable statutory inspection registers & Schedule H1 CSV under D&C Rules 1945.",
  },
  "/dashboard/gst/rates": {
    title: "HSN & GST Tax Slabs",
    description: "View and configure pharmaceutical HSN codes and GST tax rates (0%, 5%, 12%, 18%).",
  },
  "/dashboard/gst/reconciliation": {
    title: "GSTR-2B ITC Reconciliation",
    description: "Match your recorded purchase GRNs against supplier-filed GSTR-2B invoices.",
  },
  "/dashboard/reports/inventory": {
    title: "Fast & Slow Movers Report",
    description: "Identify top-selling medicines, slow-moving items, and non-moving dead inventory.",
  },
  "/dashboard/reports/expiry": {
    title: "Expiry Exposure & Loss Risk",
    description: "Audit expired batches and near-expiry stock in 30, 60, and 90-day risk buckets.",
  },
  "/dashboard/reports/expiry-redistribution": {
    title: "Expiry Redistribution Suggestions",
    description: "Reallocate near-expiry batches from slow branches to high-velocity stores before expiry.",
  },
  "/dashboard/settings/profile": {
    title: "Profile & Security",
    description: "Update your display name, change password, and manage Google OAuth sign-in linking.",
  },
  "/dashboard/settings/printers": {
    title: "Thermal & A4 Printer Setup",
    description: "Configure 80mm ESC/POS thermal receipt printers and run a test print.",
  },
  "/dashboard/settings/gst": {
    title: "GST & E-Invoice Configuration",
    description: "Configure store GSTIN, state code, composition/regular scheme & NIC E-Invoice settings.",
  },
  "/dashboard/settings/privacy": {
    title: "Customer Privacy & DPDP Consent",
    description: "Manage patient privacy notices, consent collection rules & data erasure workflows.",
  },
  "/dashboard/settings/sms": {
    title: "SMS Gateway & Templates",
    description: "Configure transactional SMS settings for bill links and medicine refill reminders.",
  },
  "/dashboard/settings/whatsapp": {
    title: "WhatsApp Business Integration",
    description: "Configure WhatsApp API credentials and automated invoice/reminder delivery.",
  },
  "/dashboard/settings/schemes/new": {
    title: "New Trade Scheme",
    description: "Define a supplier free-quantity bonus scheme (e.g. 10+1) or promotional discount.",
  },
  "/dashboard/settings/stores/new": {
    title: "Add Store or Warehouse",
    description: "Create a new retail pharmacy branch or central distribution warehouse.",
  },
  "/dashboard/suppliers/new": {
    title: "Add Supplier / Distributor",
    description: "Register a new pharmaceutical wholesaler with GSTIN, drug license & payment terms.",
  },
  "/dashboard/whatsapp/templates": {
    title: "WhatsApp Message Templates",
    description: "Manage pre-approved WhatsApp templates for digital bills, payment links & refill alerts.",
  },
  "/dashboard/import/new": {
    title: "New Data Migration Job",
    description: "Upload and map legacy Marg ERP or CSV files to import catalog, batches & balances.",
  },
  "/api/export/sales": {
    title: "Export Sales CSV",
    description: "Download a CSV spreadsheet of sales invoices for the selected date range.",
  },
  "/api/export/purchases": {
    title: "Export Purchases CSV",
    description: "Download a CSV spreadsheet of supplier purchase GRNs for the selected date range.",
  },
  "/api/export/batches": {
    title: "Export Batches CSV",
    description: "Download a CSV spreadsheet of all active medicine batches, expiry dates & stock valuation.",
  },
};

// Merge PALETTE_NAV_ITEMS into ROUTE_CATALOG
const ROUTE_CATALOG: Record<string, RouteMeta> = { ...STATIC_ROUTE_CATALOG };
for (const item of PALETTE_NAV_ITEMS) {
  if (item.description && !ROUTE_CATALOG[item.href]) {
    ROUTE_CATALOG[item.href] = {
      title: item.label,
      description: item.description,
      shortcut: item.shortcut,
    };
  } else if (item.description && ROUTE_CATALOG[item.href] && !ROUTE_CATALOG[item.href].shortcut && item.shortcut) {
    ROUTE_CATALOG[item.href].shortcut = item.shortcut;
  }
}

function matchRouteMeta(href: string): RouteMeta | null {
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) return null;
  let path = href;
  try {
    if (href.startsWith("http")) {
      const url = new URL(href);
      path = url.pathname + url.search;
    }
  } catch {
    // keep raw
  }

  if (ROUTE_CATALOG[path]) return ROUTE_CATALOG[path];
  const basePath = path.split("?")[0];
  if (ROUTE_CATALOG[basePath]) return ROUTE_CATALOG[basePath];

  // Dynamic route patterns
  if (/^\/dashboard\/sales\/[^/]+\/print$/.test(basePath)) {
    return { title: "Print Tax Invoice", description: "Open printable 80mm thermal slip or A4 GST invoice for this bill." };
  }
  if (/^\/dashboard\/sales\/[^/]+\/return$/.test(basePath)) {
    return { title: "Process Sales Return", description: "Return items from this bill back to inventory and issue a GST Credit Note." };
  }
  if (/^\/dashboard\/sales\/returns\/[^/]+\/print$/.test(basePath)) {
    return { title: "Print Credit Note", description: "Print customer sales return receipt and GST credit note." };
  }
  if (/^\/dashboard\/sales\/[^/]+$/.test(basePath)) {
    return { title: "View Invoice Details", description: "Inspect line items, batch numbers, GST breakup & payment mode for this sale." };
  }
  if (/^\/dashboard\/purchases\/orders\/[^/]+\/print$/.test(basePath)) {
    return { title: "Print Purchase Order", description: "Open printable supplier Purchase Order document." };
  }
  if (/^\/dashboard\/purchases\/orders\/[^/]+$/.test(basePath)) {
    return { title: "Purchase Order Details", description: "View ordered items, received quantities & convert PO into a GRN." };
  }
  if (/^\/dashboard\/purchases\/returns\/[^/]+\/print$/.test(basePath)) {
    return { title: "Print Debit Note", description: "Print vendor purchase return GST debit note." };
  }
  if (/^\/dashboard\/purchases\/[^/]+$/.test(basePath)) {
    return { title: "Purchase GRN Details", description: "Inspect inward supplier invoice items, batch margins, free schemes & ITC." };
  }
  if (/^\/dashboard\/suppliers\/[^/]+\/pay$/.test(basePath)) {
    return { title: "Pay Supplier", description: "Record a payment voucher to settle pending purchase bills for this distributor." };
  }
  if (/^\/dashboard\/suppliers\/[^/]+$/.test(basePath)) {
    return { title: "Supplier Ledger & Profile", description: "View distributor contact info, GSTIN, purchase history & payable balance." };
  }
  if (/^\/dashboard\/customers\/[^/]+\/loyalty$/.test(basePath)) {
    return { title: "Customer Loyalty Ledger", description: "View earned and redeemed loyalty reward points for this patient." };
  }
  if (/^\/dashboard\/customers\/[^/]+\/privacy$/.test(basePath)) {
    return { title: "Customer Privacy & Consents", description: "Manage patient data processing consents and privacy rights." };
  }
  if (/^\/dashboard\/accounting\/ledger\/[^/]+$/.test(basePath)) {
    return { title: "Account Ledger Statement", description: "View chronological debit/credit postings and running balance for this account." };
  }
  if (/^\/dashboard\/inventory\/stocktake\/[^/]+\/print$/.test(basePath)) {
    return { title: "Print Stocktake Sheet", description: "Print physical shelf-count checklist for floor verification." };
  }
  if (/^\/dashboard\/inventory\/stocktake\/[^/]+$/.test(basePath)) {
    return { title: "Stocktake Audit Session", description: "Enter counted shelf quantities and post variance adjustments." };
  }
  if (/^\/dashboard\/inventory\/transfers\/[^/]+\/print$/.test(basePath)) {
    return { title: "Print Transfer Challan", description: "Print inter-branch stock transfer delivery challan." };
  }
  if (/^\/dashboard\/inventory\/transfers\/[^/]+$/.test(basePath)) {
    return { title: "Stock Transfer Details", description: "Track dispatch, in-transit batches & receiving confirmation across branches." };
  }
  if (/^\/dashboard\/help\/[^/]+$/.test(basePath)) {
    return { title: "Read Workflow Guide", description: "Step-by-step Standard Operating Procedure (SOP) and troubleshooting tips." };
  }

  return null;
}

/**
 * Pharmacy & ERP Table Column / Terminology Dictionary
 */
const COLUMN_DICTIONARY: Record<string, { title: string; description: string }> = {
  item: { title: "Medicine / Item Name", description: "Brand or generic formulation name, strength, and dosage form." },
  medicine: { title: "Medicine Formulation", description: "Registered pharmaceutical product and salt composition." },
  category: { title: "Therapeutic Category", description: "Pharmacological or product grouping (e.g., Antibiotic, Analgesic, OTC)." },
  rack: { title: "Rack / Shelf Location", description: "Physical storage bin or shelf code in the store for fast picking." },
  pack: { title: "Pack Size", description: "Units per strip/bottle (e.g., 10 tablets per strip) used for loose-unit billing." },
  "hsn / gst": { title: "HSN Code & GST Slab", description: "Harmonized System of Nomenclature code and applicable GST tax percentage." },
  hsn: { title: "HSN Code", description: "Statutory tax classification code required on GST invoices and GSTR-1." },
  mrp: { title: "Maximum Retail Price (MRP)", description: "Printed ceiling retail price inclusive of all taxes per pack." },
  "sale price": { title: "Counter Selling Price", description: "Default retail billing rate per pack charged to customers." },
  ptr: { title: "Price to Retailer (PTR)", description: "Wholesale purchase cost per unit/pack paid to the distributor (excluding GST)." },
  "purchase rate": { title: "Purchase Rate (PTR)", description: "Landed distributor cost per unit used for margin and stock valuation." },
  batch: { title: "Batch / Lot Number", description: "Manufacturer batch identifier tracked for expiry, recall, and drug compliance." },
  "batch no": { title: "Batch Number", description: "Manufacturer lot number printed on the strip/bottle." },
  expiry: { title: "Expiry Date", description: "Month and year after which the batch cannot be dispensed (FEFO enforced)." },
  "expiry date": { title: "Batch Expiry Date", description: "Statutory expiration date; POS automatically prioritizes earliest expiry (FEFO)." },
  "qty on hand": { title: "Quantity on Hand", description: "Current physical saleable units available in this store's inventory." },
  qty: { title: "Quantity", description: "Number of units or packs in this transaction or stock line." },
  stock: { title: "Available Stock", description: "Current on-hand inventory balance across active batches." },
  valuation: { title: "Stock Valuation", description: "Inventory value calculated as Quantity on Hand × Purchase Rate (PTR)." },
  taxable: { title: "Taxable Value", description: "Net pre-tax transaction amount on which CGST/SGST or IGST is computed." },
  gst: { title: "Goods & Services Tax (GST)", description: "Total tax amount (CGST + SGST for intra-state, or IGST for inter-state)." },
  cgst: { title: "Central GST (CGST)", description: "Central government share of intra-state GST (half of the total GST rate)." },
  sgst: { title: "State GST (SGST)", description: "State government share of intra-state GST (half of the total GST rate)." },
  igst: { title: "Integrated GST (IGST)", description: "Inter-state GST applied when supplier and store are in different states." },
  itc: { title: "Input Tax Credit (ITC)", description: "GST paid on inward purchases eligible to offset outward GST liability." },
  total: { title: "Total Amount", description: "Final net payable amount inclusive of taxes, discounts, and rounding." },
  status: { title: "Record Status", description: "Current lifecycle or settlement state of this transaction or account." },
  branch: { title: "Branch / Store Config", description: "Store-specific overrides such as rack assignment or reorder level." },
  "loyalty points": { title: "Loyalty Reward Points", description: "Accumulated customer reward points redeemable as discounts on future bills." },
  "credit limit": { title: "Maximum Credit Limit", description: "Maximum outstanding unpaid balance permitted for this customer account." },
  gstin: { title: "GST Identification Number", description: "15-character statutory business tax registration number." },
  "drug licence": { title: "Drug License Number", description: "Form 20B/21B statutory drug sale license number under D&C Act." },
  debit: { title: "Debit (Dr)", description: "Double-entry debit amount (increases assets/expenses, decreases liabilities/income)." },
  credit: { title: "Credit (Cr)", description: "Double-entry credit amount (increases liabilities/income, decreases assets/expenses)." },
  balance: { title: "Running / Closing Balance", description: "Net account balance after applying posted debit and credit entries." },
  schedule: { title: "Drug Schedule Classification", description: "Regulatory class (OTC, Schedule H, H1, X, Narcotic) governing prescription rules." },
  doctor: { title: "Prescribing Doctor", description: "Registered medical practitioner (RMP) who issued the prescription." },
  patient: { title: "Patient / Customer", description: "Person for whom the scheduled medicine was prescribed and dispensed." },
};

function inferElementTooltip(target: HTMLElement): {
  element: HTMLElement;
  title?: string;
  description: string;
  shortcut?: string;
  placement?: TooltipPlacement;
} | null {
  // Walk up from target to find the nearest meaningful interactive or annotated node
  let el: HTMLElement | null = target;
  while (el && el !== document.body) {
    // Skip elements inside the tooltip portal itself
    if (el.dataset.tooltipPortal === "true") return null;

    // 1. Convert native `title` attribute to `data-original-title` so browser native tooltip never conflicts
    if (el.hasAttribute("title")) {
      const rawTitle = el.getAttribute("title")?.trim();
      if (rawTitle) {
        el.setAttribute("data-original-title", rawTitle);
      }
      el.removeAttribute("title");
    }

    // 2. Explicit `data-tooltip` attribute
    const explicit = el.dataset.tooltip?.trim();
    if (explicit) {
      return {
        element: el,
        title: el.dataset.tooltipTitle?.trim() || undefined,
        description: explicit,
        shortcut: el.dataset.tooltipShortcut?.trim() || undefined,
        placement: (el.dataset.tooltipPlacement as TooltipPlacement) || undefined,
      };
    }

    // 3. Saved `data-original-title`
    const origTitle = el.getAttribute("data-original-title")?.trim();
    if (origTitle) {
      return {
        element: el,
        description: origTitle,
        placement: (el.dataset.tooltipPlacement as TooltipPlacement) || undefined,
      };
    }

    // 4. Anchor links (<a href="...">) -> match against route catalog or text
    if (el.tagName === "A") {
      const href = el.getAttribute("href") || "";
      const routeMeta = matchRouteMeta(href);
      if (routeMeta) {
        return {
          element: el,
          title: routeMeta.title,
          description: routeMeta.description,
          shortcut: routeMeta.shortcut,
        };
      }
      const label = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
      if (label && label.length <= 60) {
        return {
          element: el,
          description: `Navigate to ${label}`,
        };
      }
    }

    // 5. Table Headers (<th>) -> explain pharmacy / financial column meaning
    if (el.tagName === "TH") {
      const colText = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      const cleanCol = colText.replace(/[^a-z0-9 /]/g, "").trim();
      const match = COLUMN_DICTIONARY[cleanCol] || COLUMN_DICTIONARY[colText];
      if (match) {
        return {
          element: el,
          title: match.title,
          description: match.description,
          placement: "top",
        };
      }
      if (colText && colText.length >= 2 && colText.length <= 40) {
        return {
          element: el,
          title: (el.textContent || "").trim(),
          description: `Column showing ${(el.textContent || "").trim().toLowerCase()} for each record in this table.`,
          placement: "top",
        };
      }
    }

    // 6. Buttons & role="button" / role="tab"
    if (
      el.tagName === "BUTTON" ||
      el.getAttribute("role") === "button" ||
      el.getAttribute("role") === "tab"
    ) {
      const ariaLabel = el.getAttribute("aria-label")?.trim();
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      const label = ariaLabel || text;
      if (label) {
        const lower = label.toLowerCase();
        if (lower.includes("export") || lower.includes("download") || lower.includes("csv")) {
          return {
            element: el,
            title: label.length <= 40 ? label : "Export Data",
            description: "Download the currently filtered records as a file for offline analysis or accounting.",
          };
        }
        if (lower.includes("print")) {
          return {
            element: el,
            title: label.length <= 40 ? label : "Print Document",
            description: "Format and send this document to your thermal receipt or A4 laser printer.",
          };
        }
        if (lower.includes("save") || lower.includes("submit") || lower.includes("update") || lower.includes("post")) {
          return {
            element: el,
            title: label.length <= 40 ? label : "Save & Commit",
            description: "Validate and save these changes to the store database.",
          };
        }
        if (lower.includes("delete") || lower.includes("remove") || lower.includes("revoke") || lower.includes("cancel")) {
          return {
            element: el,
            title: label.length <= 40 ? label : "Cancel / Remove",
            description: "Cancel or remove this item. Statutory posted entries remain traceable in the audit log.",
          };
        }
        if (lower.includes("filter") || lower.includes("search") || lower.includes("find")) {
          return {
            element: el,
            title: label.length <= 40 ? label : "Filter Records",
            description: "Narrow down the displayed records using the selected criteria.",
          };
        }
        if (lower.includes("reconcile")) {
          return {
            element: el,
            title: label.length <= 40 ? label : "Reconcile Records",
            description: "Match and verify internal ERP entries against external statements or physical counts.",
          };
        }
        if (lower.includes("approve") || lower.includes("verify")) {
          return {
            element: el,
            title: label.length <= 40 ? label : "Verify & Approve",
            description: "Confirm regulatory or managerial approval for this record.",
          };
        }
        if (el.getAttribute("role") === "tab") {
          return {
            element: el,
            title: label.length <= 40 ? label : "Switch View",
            description: `Switch view to ${label}.`,
          };
        }
        if (ariaLabel && !text) {
          return {
            element: el,
            description: ariaLabel,
          };
        }
        if (label.length >= 2 && label.length <= 48) {
          return {
            element: el,
            description: `Action: ${label}`,
          };
        }
      }
    }

    // 7. Form inputs / selects with placeholders or labels
    if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") {
      const inputEl = el as HTMLInputElement;
      if (inputEl.type === "hidden") return null;
      const id = inputEl.id;
      let labelText = "";
      if (id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lbl) labelText = (lbl.textContent || "").replace(/\*/g, "").trim();
      }
      if (!labelText) {
        const parentLabel = el.closest("label");
        if (parentLabel) labelText = (parentLabel.textContent || "").replace(/\*/g, "").trim();
      }
      const placeholder = inputEl.getAttribute("placeholder")?.trim();
      const aria = inputEl.getAttribute("aria-label")?.trim();

      if (labelText || aria || placeholder) {
        return {
          element: el,
          title: labelText || aria || undefined,
          description: placeholder
            ? `${labelText ? `${labelText} — ` : ""}${placeholder}`
            : `Enter or select ${(labelText || aria || "value").toLowerCase()}.`,
          placement: "top",
        };
      }
    }

    el = el.parentElement;
  }

  return null;
}

export function GlobalTooltipLayer() {
  const { tooltipsEnabled } = useShell();
  const pathname = usePathname();
  const [active, setActive] = useState<TooltipData | null>(null);
  const [mounted, setMounted] = useState(false);
  const currentElRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Synchronize root attribute and clear active tooltip when toggled off or route changes
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.tooltips = tooltipsEnabled ? "on" : "off";
    }
    setActive(null);
    currentElRef.current = null;
  }, [tooltipsEnabled, pathname]);

  const hideTooltip = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    currentElRef.current = null;
    setActive(null);
  }, []);

  useEffect(() => {
    // When tooltips are disabled in Settings, still strip native `title` on hover so browser tooltips don't appear
    if (!tooltipsEnabled) {
      const suppressNativeTitle = (e: MouseEvent) => {
        let el = e.target as HTMLElement | null;
        while (el && el !== document.body) {
          if (el.hasAttribute("title")) {
            const t = el.getAttribute("title")?.trim();
            if (t) el.setAttribute("data-original-title", t);
            el.removeAttribute("title");
          }
          el = el.parentElement;
        }
      };
      document.addEventListener("mouseover", suppressNativeTitle, { passive: true });
      return () => document.removeEventListener("mouseover", suppressNativeTitle);
    }

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const resolved = inferElementTooltip(target);
      if (!resolved) {
        hideTooltip();
        return;
      }

      if (currentElRef.current === resolved.element) return;

      if (timerRef.current) clearTimeout(timerRef.current);
      currentElRef.current = resolved.element;

      timerRef.current = setTimeout(() => {
        if (!currentElRef.current || !document.body.contains(currentElRef.current)) return;
        const rect = currentElRef.current.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        // Determine smart placement (sidebar items prefer 'right', topbar items prefer 'bottom')
        let placement: TooltipPlacement = resolved.placement || "top";
        if (!resolved.placement) {
          const inSidebar = currentElRef.current.closest("aside");
          const inTopbar = currentElRef.current.closest("header");
          if (inSidebar) {
            placement = "right";
          } else if (inTopbar || rect.top < 80) {
            placement = "bottom";
          }
        }

        setActive({
          title: resolved.title,
          description: resolved.description,
          shortcut: resolved.shortcut,
          placement,
          rect,
        });
      }, 140);
    };

    const handleMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (currentElRef.current && related && currentElRef.current.contains(related)) {
        return;
      }
      hideTooltip();
    };

    const handleScrollOrKey = () => {
      if ( currentElRef.current ) hideTooltip();
    };

    document.addEventListener("mouseover", handleMouseOver, { passive: true });
    document.addEventListener("mouseout", handleMouseOut, { passive: true });
    window.addEventListener("scroll", handleScrollOrKey, { capture: true, passive: true });
    window.addEventListener("keydown", handleScrollOrKey, { passive: true });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("mouseout", handleMouseOut);
      window.removeEventListener("scroll", handleScrollOrKey, { capture: true });
      window.removeEventListener("keydown", handleScrollOrKey);
    };
  }, [tooltipsEnabled, hideTooltip]);

  if (!mounted || !tooltipsEnabled || !active) return null;

  // Calculate clamped viewport coordinates
  const { rect, placement, title, description, shortcut } = active;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const maxWidth = 280;
  const gap = 8;

  let top = 0;
  let left = 0;
  let transform = "";

  if (placement === "right") {
    left = rect.right + gap;
    top = rect.top + rect.height / 2;
    transform = "translateY(-50%)";
    if (left + maxWidth > vw - 12) {
      // Fallback to bottom or top
      left = Math.min(Math.max(12, rect.left + rect.width / 2), vw - maxWidth / 2 - 12);
      top = rect.bottom + gap;
      transform = "translateX(-50%)";
    }
  } else if (placement === "left") {
    left = rect.left - gap;
    top = rect.top + rect.height / 2;
    transform = "translate(-100%, -50%)";
  } else if (placement === "bottom") {
    left = Math.min(Math.max(maxWidth / 2 + 12, rect.left + rect.width / 2), vw - maxWidth / 2 - 12);
    top = rect.bottom + gap;
    transform = "translateX(-50%)";
  } else {
    // top (default)
    left = Math.min(Math.max(maxWidth / 2 + 12, rect.left + rect.width / 2), vw - maxWidth / 2 - 12);
    top = rect.top - gap;
    transform = "translate(-50%, -100%)";
    if (rect.top < 72) {
      top = rect.bottom + gap;
      transform = "translateX(-50%)";
    }
  }

  // Clamp vertical position inside viewport
  if (top > vh - 40) {
    top = rect.top - gap;
    transform = "translate(-50%, -100%)";
  }

  return createPortal(
    <div
      role="tooltip"
      data-tooltip-portal="true"
      style={{
        position: "fixed",
        top: `${Math.round(top)}px`,
        left: `${Math.round(left)}px`,
        transform,
        maxWidth: `${maxWidth}px`,
        zIndex: 9999,
      }}
      className="pointer-events-none select-none rounded-lg border border-ink-800/90 bg-ink-950/95 px-3 py-2 text-white shadow-xl backdrop-blur-md transition-opacity duration-100 print:hidden"
    >
      {(title || shortcut) && (
        <div className="flex items-center justify-between gap-2 mb-0.5">
          {title && (
            <span className="text-[12px] font-semibold text-white leading-snug">
              {title}
            </span>
          )}
          {shortcut && (
            <kbd className="inline-flex items-center rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white/90 shrink-0">
              {shortcut}
            </kbd>
          )}
        </div>
      )}
      <p className="text-[11.5px] leading-relaxed text-ink-200 font-normal">
        {description}
      </p>
    </div>,
    document.body
  );
}
