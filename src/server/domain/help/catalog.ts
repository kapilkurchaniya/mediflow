export type HelpCategory = "billing" | "inventory" | "compliance" | "offline";

export interface HelpStep {
  title: string;
  content: string;
  shortcutKey?: string;
  callout?: string;
  tip?: string;
}

export interface HelpFaq {
  q: string;
  a: string;
}

export interface HelpArticle {
  slug: string;
  title: string;
  summary: string;
  category: HelpCategory;
  readMinutes: number;
  badge?: string;
  targetRole: string;
  actionRoute?: string;
  actionLabel?: string;
  steps: HelpStep[];
  faqs: HelpFaq[];
  relatedSlugs: string[];
  keywords: string[];
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "first-bill",
    title: "Fast Counter Billing & First Invoice",
    summary: "Learn how to search medicines with F2, pick batches with FEFO sorting, record prescriptions, and print 80mm receipts.",
    category: "billing",
    readMinutes: 3,
    badge: "Core Counter Flow",
    targetRole: "Cashier, Pharmacist",
    actionRoute: "/dashboard/sales/pos",
    actionLabel: "Open POS Counter (F2)",
    steps: [
      {
        title: "1. Launch the POS Terminal",
        content: "Press F2 anywhere in MediFlow or click 'POS Billing' from the sidebar to focus the counter terminal.",
        shortcutKey: "F2",
      },
      {
        title: "2. Search Formulation or Scan Barcode",
        content: "Type the brand name (e.g., 'Dolo 650') or scan the EAN-13 barcode. Results display live stock, rack location, and nearest expiry date.",
        shortcutKey: "Alt + S",
        tip: "MediFlow automatically suggests active generic substitutes if the requested brand is out of stock.",
      },
      {
        title: "3. Confirm Batch & Quantity",
        content: "Batches are ordered by First-Expiry-First-Out (FEFO). The nearest non-expired batch is auto-selected to minimize shelf waste.",
        callout: "Drugs expiring within 90 days are flagged with an amber badge for pharmacist awareness.",
      },
      {
        title: "4. Schedule H / H1 Prescription Validation",
        content: "If the item is Schedule H or H1, enter the Doctor's Registration Number and Patient Name. This automatically populates your statutory Form 65(9)(b) register.",
      },
      {
        title: "5. Split Tender & Instant Checkout",
        content: "Press F4 or Ctrl + Enter. Accept split payments (e.g. Cash + UPI Dynamic QR), redeem loyalty points, and hit Enter to print the 80mm thermal bill.",
        shortcutKey: "F4 / Ctrl+Enter",
      },
    ],
    faqs: [
      { q: "What if the printer is disconnected?", a: "Bills are safely committed to the database. You can reprint anytime from Sales History (Alt + H)." },
      { q: "Can I hold a cart while the customer grabs another item?", a: "Yes, press F8 to park the bill, serve the next customer, then press Alt + P to recall it." },
    ],
    relatedSlugs: ["sales-returns", "offline-mode", "narcotics-compliance"],
    keywords: ["pos", "bill", "invoice", "receipt", "fefo", "thermal", "f2", "cashier", "checkout"],
  },
  {
    slug: "sales-returns",
    title: "Sales Returns & GST Credit Notes",
    summary: "How to process customer returns against original invoices, handle batch returns, and issue GST Rule 53 credit notes.",
    category: "billing",
    readMinutes: 3,
    badge: "GST Rule 53",
    targetRole: "Cashier, Store Manager",
    actionRoute: "/dashboard/sales/returns",
    actionLabel: "View Returns Register",
    steps: [
      {
        title: "1. Locate Original Invoice",
        content: "Navigate to Sales Returns and type the 16-character canonical invoice number or scan the QR code from the customer's thermal slip.",
      },
      {
        title: "2. Select Returned Line Items",
        content: "Verify the batch number printed on the returned strip matches the original sale. Enter returned quantity and reason code (Damaged, Expired, Excess).",
      },
      {
        title: "3. Choose Refund Settlement Mode",
        content: "Issue a cash refund, reverse to original UPI payment, or generate a Store Credit Note redeemable against future purchases.",
      },
      {
        title: "4. Automated Accounting & Inventory Adjustment",
        content: "MediFlow automatically creates an outward credit note, reverses proportional CGST & SGST, and increments non-expired stock or flags damaged stock for quarantine.",
      },
    ],
    faqs: [
      { q: "Can a customer return medicines without an invoice?", a: "For compliance with Drugs & Cosmetics rules, sales returns require linking to an original bill." },
    ],
    relatedSlugs: ["first-bill", "gst-filing"],
    keywords: ["return", "credit note", "refund", "damaged", "expiry", "reversal"],
  },
  {
    slug: "stock-transfers",
    title: "Inter-Branch Transfers & E-Way Bills",
    summary: "Transfer inventory between retail stores or central warehouse with indent approvals and Part-A E-Way bill generation.",
    category: "inventory",
    readMinutes: 4,
    badge: "GST Rule 138",
    targetRole: "Store Manager, Warehouse Supervisor",
    actionRoute: "/dashboard/inventory/transfers",
    actionLabel: "Manage Transfers",
    steps: [
      {
        title: "1. Create Stock Transfer Indent",
        content: "Select the destination branch and add medicines with target quantities. Review available batch stock at the issuing location.",
      },
      {
        title: "2. Dispatch Approval & Delivery Challan",
        content: "When packing the consignment, MediFlow generates a statutory Delivery Challan under GST Rule 55 with serial numbers and HSN breakdown.",
      },
      {
        title: "3. Automated E-Way Bill Verification",
        content: "If the consignment value exceeds ₹50,000 (or state-specific threshold), MediFlow validates vehicle number and generates E-Way Bill Part-A credentials.",
      },
      {
        title: "4. Inward Verification at Receiving Branch",
        content: "The receiving store scans incoming batches. MediFlow performs variance detection: matching items increase local stock, while shortages trigger transit claims.",
      },
    ],
    faqs: [
      { q: "What happens if a transferred item is damaged in transit?", a: "Receiving staff marks the quantity as Damaged. MediFlow posts an inventory loss and notifies the issuing store." },
    ],
    relatedSlugs: ["gst-filing", "offline-mode"],
    keywords: ["transfer", "indent", "warehouse", "challan", "eway bill", "transit", "inter-branch"],
  },
  {
    slug: "gst-filing",
    title: "Monthly GST Filing & GSTR-1/2B Reconciliation",
    summary: "Step-by-step instructions for exporting GSTR-1 JSON for GSTN Offline Tool v1.4, matching 2B ITC, and handing off to your CA.",
    category: "compliance",
    readMinutes: 4,
    badge: "Statutory Filing",
    targetRole: "Accountant, Business Owner",
    actionRoute: "/dashboard/accounting/export",
    actionLabel: "Download CA Audit Pack",
    steps: [
      {
        title: "1. Close the Month-End Period",
        content: "Ensure all counter cash sessions are reconciled and supplier purchase invoices for the tax period are approved.",
      },
      {
        title: "2. Reconcile Inward ITC with GSTR-2B",
        content: "Upload your portal GSTR-2B JSON. MediFlow matches supplier invoices within 16(2)(aa) tolerance and flags blocked ITC or missing filings.",
      },
      {
        title: "3. Export Official GSTR-1 JSON",
        content: "Open CA Audit Pack in Accounting. Click 'Export GSTR-1 JSON'. The file strictly conforms to GSTN Offline Tool v1.4 (B2B, B2CS, CDNR, HSN data).",
      },
      {
        title: "4. Hand Off Audit Pack to CA",
        content: "Download the complete ZIP containing Sales Register CSV, Purchase Register CSV with ITC flags, Trial Balance, and Stock Valuation.",
      },
    ],
    faqs: [
      { q: "Does the GSTR-1 JSON require manual corrections?", a: "No. The schema is pre-validated with GSTN Offline Tool specs including UQC, state codes, and rate breakdowns." },
    ],
    relatedSlugs: ["sales-returns", "stock-transfers"],
    keywords: ["gst", "gstr1", "gstr2b", "itc", "tax", "offline tool", "audit", "ca pack"],
  },
  {
    slug: "offline-mode",
    title: "Counter Continuity & Offline Auto-Sync",
    summary: "How MediFlow protects billing when broadband drops, utilizing local SQLite caching and conflict-free sync recovery.",
    category: "offline",
    readMinutes: 3,
    badge: "Zero-Downtime",
    targetRole: "All Counter Staff",
    actionRoute: "/dashboard/sales/pos",
    actionLabel: "Inspect POS Counter",
    steps: [
      {
        title: "1. Automatic Offline Detection",
        content: "If the internet connection drops, MediFlow instantly switches to Offline Counter Mode. A banner appears indicating offline continuity.",
      },
      {
        title: "2. Local Product & Price Lookup",
        content: "The desktop SQLite database holds the store's complete medicine catalog, batch stock, and customer points for zero-latency queries.",
      },
      {
        title: "3. Provisional Offline Invoicing",
        content: "Bills continue printing with provisional invoice series (e.g. OFF-001). Stock deductions are reserved in local SQLite cache.",
      },
      {
        title: "4. Automatic Sync on Reconnection",
        content: "As soon as connectivity restores, MediFlow's background sync engine batches pending sales, reserves official 16-char GST numbers, and updates cloud ledgers.",
      },
    ],
    faqs: [
      { q: "Will I lose sales if the computer restarts during an outage?", a: "No. Every line item is committed to SQLite locally before the receipt prints." },
    ],
    relatedSlugs: ["first-bill", "stock-transfers"],
    keywords: ["offline", "sync", "sqlite", "connectivity", "outage", "resilience"],
  },
  {
    slug: "narcotics-compliance",
    title: "Schedule H1 & Narcotics Register Tracking",
    summary: "Drugs and Cosmetics Rule 65(9)(b) statutory record keeping for Habit Forming, Schedule X, and H1 dispensations.",
    category: "compliance",
    readMinutes: 3,
    badge: "D&C Rules 1945",
    targetRole: "Dispensing Pharmacist",
    actionRoute: "/dashboard/compliance/export",
    actionLabel: "Download Inspector Pack",
    steps: [
      {
        title: "1. Automated Schedule Flagging",
        content: "When a Schedule H1, X, or Narcotic formulation is added to the cart, MediFlow requires prescriber registration and patient address.",
      },
      {
        title: "2. Register Entry Commitment",
        content: "Each completed transaction writes directly to the immutable statutory register with patient details, doctor registration number, batch, and dispensing pharmacist.",
      },
      {
        title: "3. One-Click Drug Inspector Export",
        content: "When a Drug Inspector visits, go to Compliance -> Export. Click 'Download Inspector Pack' for clean Form 20/21/65(9)(b) CSV registers.",
      },
    ],
    faqs: [
      { q: "How long are Schedule H1 registers retained?", a: "By Indian law, Schedule H1 registers must be preserved for a minimum of 3 years from the date of entry." },
    ],
    relatedSlugs: ["first-bill", "gst-filing"],
    keywords: ["schedule h", "schedule h1", "narcotics", "drug inspector", "rule 65", "pharmacist"],
  },
  {
    slug: "margins-and-discounts",
    title: "Trade Discounts, MRP Caps & Customer Loyalty",
    summary: "Configure customer tier discounts, enforce NPPA ceiling prices, and redeem loyalty points at counter checkout.",
    category: "billing",
    readMinutes: 3,
    badge: "Pricing & Loyalty",
    targetRole: "Cashier, Store Manager",
    actionRoute: "/dashboard/settings/loyalty",
    actionLabel: "Configure Loyalty Rules",
    steps: [
      {
        title: "1. Customer Phone Number Lookup",
        content: "Type the customer's 10-digit mobile number at the POS. The counter displays their name, active tier, and redeemable points balance.",
      },
      {
        title: "2. Line-Level vs Invoice Discounts",
        content: "Apply percentage or flat rupee discounts per line item or across the total bill. MediFlow verifies price stays below DPCO legal ceiling.",
      },
      {
        title: "3. 100-Point Loyalty Redemption",
        content: "When a customer has 100+ points, click 'Redeem Points'. Points apply as cash tender, reducing the net payable amount instantly.",
      },
    ],
    faqs: [
      { q: "Can a cashier discount beyond the store limit?", a: "No. Discounts exceeding the configured cashier threshold require manager override credentials." },
    ],
    relatedSlugs: ["first-bill", "sales-returns"],
    keywords: ["discount", "loyalty", "points", "mrp", "dpco", "nppa", "ceiling price"],
  },
];

export function getAllHelpArticles(): HelpArticle[] {
  return HELP_ARTICLES;
}

export function getHelpArticleBySlug(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

export function searchHelpArticles(query: string, category?: HelpCategory | "all"): HelpArticle[] {
  const q = query.toLowerCase().trim();
  return HELP_ARTICLES.filter((article) => {
    if (category && category !== "all" && article.category !== category) return false;
    if (!q) return true;
    return (
      article.title.toLowerCase().includes(q) ||
      article.summary.toLowerCase().includes(q) ||
      article.keywords.some((kw) => kw.includes(q)) ||
      article.steps.some((s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q))
    );
  });
}
