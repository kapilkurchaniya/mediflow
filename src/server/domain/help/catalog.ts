export type HelpCategory =
  | "billing"
  | "inventory"
  | "purchasing"
  | "compliance"
  | "ai-tools"
  | "offline";

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
    summary:
      "Learn how to search medicines with F3, pick batches with FEFO sorting, fill the scrollable Doctor & Prescription panel, and finalize bills with F10.",
    category: "billing",
    readMinutes: 3,
    badge: "Core Counter Flow",
    targetRole: "Cashier, Pharmacist",
    actionRoute: "/dashboard/sales/pos",
    actionLabel: "Open POS Counter (F2)",
    steps: [
      {
        title: "1. Launch the POS Terminal",
        content:
          "Press F2 or click 'New bill' in the sidebar to open the POS Counter. Use Ctrl+B to collapse the sidebar for Focus Mode, or Ctrl+Shift+S to switch branches.",
        shortcutKey: "F2",
      },
      {
        title: "2. Search Formulation or Scan Barcode / GS1 Pack QR",
        content:
          "Press F3 (or '/' or Insert) to focus the search bar, then type a brand/generic name or scan an EAN-13, GS1-128, or Schedule H2 pack QR code (auto-extracts GTIN, Batch, and Expiry). Click '+ New' in Customer & Loyalty to add a customer inline, or press F5 to jump to the customer picker.",
        shortcutKey: "F3 / F5",
        tip: "MediFlow automatically suggests active generic substitutes or Promise Orders ('*') if the requested brand is out of stock. Use the bottom Live Keybar or Ctrl+F1 to view MediFlow or Marg Classic shortcuts.",
      },
      {
        title: "3. Confirm Batch, Quantity (Packs / Loose) & Refill Days",
        content:
          "Batches are ordered by First-Expiry-First-Out (FEFO). Enter Packs (Strips), Loose (Tablets), or Refill (days) to auto-schedule WhatsApp refill reminders. Press Ctrl+Z (or Alt+Backspace in Marg Classic) to undo the last removed cart line.",
        callout:
          "Drugs expiring within 90 days are flagged with an amber badge, and CDSCO banned FDCs or Legal Metrology MRP breaches are guarded automatically.",
      },
      {
        title: "4. Scrollable Doctor & Prescription Validation",
        content:
          "When Schedule H, H1, or X items are in the cart, the Doctor & Prescription card opens automatically with a scrollable form for Doctor Name, Reg. No, Patient Name, Age/Gender, Date, and Rx Ref.",
      },
      {
        title: "5. Hold, Split Tender, UPI QR & Finalize Bill",
        content:
          "Press F6 to Hold a bill, F7 to recall Parked bills, F8 for Split Tender / Credit (press 'U' in the payment modal to display a Dynamic UPI QR for the exact payable amount), or F10 / Ctrl+Enter (End / Ctrl+W in Marg Classic) to Finalize & Print in Thermal 80mm, 58mm, A5, or A4 across 6 Indian bill languages, or share via WhatsApp Desktop.",
        shortcutKey: "F10 / F8",
      },
    ],
    faqs: [
      {
        q: "What if the printer is disconnected?",
        a: "Bills are safely committed to the database. You can reprint anytime from Sales & Invoices.",
      },
      {
        q: "Can I hold a cart while the customer grabs another item?",
        a: "Yes, press F6 (Hold) to park the bill, serve the next customer, then press F7 (Parked) to recall it.",
      },
    ],
    relatedSlugs: [
      "sales-returns",
      "cash-register-shifts",
      "custom-billing-templates",
      "offline-mode",
    ],
    keywords: [
      "pos",
      "bill",
      "invoice",
      "receipt",
      "fefo",
      "thermal",
      "f2",
      "f3",
      "f6",
      "f7",
      "f8",
      "f10",
      "cashier",
      "checkout",
    ],
  },
  {
    slug: "sales-returns",
    title: "Sales Returns & GST Credit Notes",
    summary:
      "How to process customer returns against original invoices, handle batch returns, and issue GST Rule 53 credit notes.",
    category: "billing",
    readMinutes: 3,
    badge: "GST Rule 53",
    targetRole: "Cashier, Store Manager",
    actionRoute: "/dashboard/sales/returns",
    actionLabel: "View Returns Register",
    steps: [
      {
        title: "1. Locate Original Invoice",
        content:
          "Navigate to Sale returns (Credit Notes) and enter the canonical invoice number or scan the QR code from the customer's slip.",
      },
      {
        title: "2. Select Returned Line Items",
        content:
          "Verify the batch number printed on the returned strip matches the original sale. Enter returned quantity and reason code (Damaged, Expired, Excess).",
      },
      {
        title: "3. Choose Refund Settlement Mode",
        content:
          "Issue a cash refund, reverse to original UPI payment, or generate a Store Credit Note redeemable against future purchases.",
      },
      {
        title: "4. Automated Accounting & Inventory Adjustment",
        content:
          "MediFlow automatically creates an outward credit note, reverses proportional CGST & SGST, and increments non-expired stock or flags damaged stock for quarantine.",
      },
    ],
    faqs: [
      {
        q: "Can a customer return medicines without an invoice?",
        a: "For compliance with Drugs & Cosmetics rules, sales returns require linking to an original bill.",
      },
    ],
    relatedSlugs: ["first-bill", "gst-filing"],
    keywords: ["return", "credit note", "refund", "damaged", "expiry", "reversal"],
  },
  {
    slug: "cash-register-shifts",
    title: "Cash Register Shifts, X-Report & Z-Report",
    summary:
      "Open counter shifts (F4), track cash pay-ins/pay-outs, print mid-shift X-Reports, and close registers with blind Z-Report reconciliation.",
    category: "purchasing",
    readMinutes: 3,
    badge: "Shift Control",
    targetRole: "Cashier, Store Manager",
    actionRoute: "/dashboard/sales/register",
    actionLabel: "Open Cash Register",
    steps: [
      {
        title: "1. Open a Register Shift",
        content:
          "Before billing (when shift enforcement is active), press F4 on the POS Counter or go to Cash register (Shifts) and enter your opening float cash.",
        shortcutKey: "F4",
      },
      {
        title: "2. Record Cash Drops & Petty Pay-Outs",
        content:
          "Log mid-day safe drops or petty cash expenses directly inside the active shift so expected drawer cash stays accurate.",
      },
      {
        title: "3. Print Mid-Shift X-Report",
        content:
          "Generate a non-closing X-Report anytime to inspect cash, UPI, card, and credit totals without ending the shift.",
      },
      {
        title: "4. Close Shift & Print Z-Report",
        content:
          "At day-end, count physical cash denominations, submit blind reconciliation, and print the statutory Z-Report for accounting sign-off.",
      },
    ],
    faqs: [
      {
        q: "What happens if physical cash differs from expected cash?",
        a: "MediFlow records the exact overage or shortage variance in the Z-Report and audit log for manager review.",
      },
    ],
    relatedSlugs: ["first-bill", "accounting-and-day-book"],
    keywords: ["shift", "cash register", "x-report", "z-report", "float", "f4", "reconciliation"],
  },
  {
    slug: "margins-and-discounts",
    title: "Trade Discounts, MRP Caps & Customer Loyalty",
    summary:
      "Configure customer tier discounts, enforce store discount limits, and redeem loyalty points at counter checkout.",
    category: "billing",
    readMinutes: 3,
    badge: "Pricing & Loyalty",
    targetRole: "Cashier, Store Manager",
    actionRoute: "/dashboard/settings/loyalty",
    actionLabel: "Configure Loyalty Rules",
    steps: [
      {
        title: "1. Customer Phone Number Lookup",
        content:
          "Type the customer's 10-digit mobile number at the POS. The counter displays their name, active tier, and redeemable points balance.",
      },
      {
        title: "2. Line-Level vs Invoice Discounts",
        content:
          "Apply percentage or flat rupee discounts per line item or across the total bill within configured store discount limits.",
      },
      {
        title: "3. Loyalty Point Redemption",
        content:
          "When a customer has redeemable points, apply them inside Split Tender / Credit (F8) to reduce the net payable amount instantly.",
        shortcutKey: "F8",
      },
    ],
    faqs: [
      {
        q: "Can a cashier discount beyond the store limit?",
        a: "No. Discounts exceeding the configured cashier threshold require manager override credentials.",
      },
    ],
    relatedSlugs: ["first-bill", "sales-returns"],
    keywords: ["discount", "loyalty", "points", "mrp", "dpco", "nppa", "ceiling price"],
  },
  {
    slug: "stock-ocr-and-csv-import",
    title: "AI Stock Sheet OCR, Multi-Page PDFs & CSV Import",
    summary:
      "Import opening stock and distributor rate sheets in seconds by scanning photos, multi-page PDFs, or uploading CSV spreadsheets.",
    category: "inventory",
    readMinutes: 4,
    badge: "AI OCR & Bulk CSV",
    targetRole: "Pharmacist, Inventory Manager",
    actionRoute: "/dashboard/inventory/batches",
    actionLabel: "Open Batches & Stock",
    steps: [
      {
        title: "1. Open Batches & Stock",
        content:
          "Go to Inventory -> Batches & Stock. You can click 'Scan Stock Sheet (OCR)', 'Import CSV', or drag-and-drop a PDF/image/CSV directly onto the page.",
      },
      {
        title: "2. Multi-Page PDF & Photo Extraction",
        content:
          "For multi-page supplier PDFs, MediFlow automatically splits pages into chunks, extracts medicine names, batches, expiry dates, MRP, and PTR, and lets you review every row before saving.",
        tip: "Use clear, well-lit photos or native PDFs for the highest extraction accuracy.",
      },
      {
        title: "3. CSV Column Mapping & Validation",
        content:
          "Upload CSV exports from older pharmacy software (Marg, Busy, Tally) and map columns to MediFlow's batch schema with duplicate and zero-rate checks.",
      },
      {
        title: "4. Paginated Valuation & Expiry Monitoring",
        content:
          "Browse stock 50 batches per page with live summary cards for total units, total valuation, zero-cost-rate alerts, and expiring-soon batches.",
      },
    ],
    faqs: [
      {
        q: "Can I import a 20-page distributor stock PDF?",
        a: "Yes. MediFlow's PDF chunker splits multi-page PDFs automatically so large stock lists import reliably without timeouts.",
      },
    ],
    relatedSlugs: ["purchases-grn-and-central-po", "stocktake-quarantine-and-licenses"],
    keywords: [
      "ocr",
      "csv",
      "import",
      "pdf",
      "stock sheet",
      "batches",
      "opening stock",
      "drag and drop",
    ],
  },
  {
    slug: "stock-transfers",
    title: "Inter-Branch Transfers & E-Way Bills",
    summary:
      "Transfer inventory between retail stores or central warehouse with indent approvals and Part-A E-Way bill generation.",
    category: "inventory",
    readMinutes: 4,
    badge: "GST Rule 138",
    targetRole: "Store Manager, Warehouse Supervisor",
    actionRoute: "/dashboard/inventory/transfers",
    actionLabel: "Manage Transfers",
    steps: [
      {
        title: "1. Create Stock Transfer Indent",
        content:
          "Select the destination branch and add medicines with target quantities. Review available batch stock at the issuing location.",
      },
      {
        title: "2. Dispatch Approval & Delivery Challan",
        content:
          "When packing the consignment, MediFlow generates a statutory Delivery Challan under GST Rule 55 with serial numbers and HSN breakdown.",
      },
      {
        title: "3. Automated E-Way Bill Verification",
        content:
          "If the consignment value exceeds ₹50,000 (or state-specific threshold), MediFlow validates vehicle number and generates E-Way Bill Part-A credentials.",
      },
      {
        title: "4. Inward Verification at Receiving Branch",
        content:
          "The receiving store scans incoming batches. MediFlow performs variance detection: matching items increase local stock, while shortages trigger transit claims.",
      },
    ],
    faqs: [
      {
        q: "What happens if a transferred item is damaged in transit?",
        a: "Receiving staff marks the quantity as Damaged. MediFlow posts an inventory loss and notifies the issuing store.",
      },
    ],
    relatedSlugs: ["gst-filing", "stocktake-quarantine-and-licenses", "offline-mode"],
    keywords: [
      "transfer",
      "indent",
      "warehouse",
      "challan",
      "eway bill",
      "transit",
      "inter-branch",
    ],
  },
  {
    slug: "stocktake-quarantine-and-licenses",
    title: "Physical Stocktake, Quarantine & Expiry Redistribution",
    summary:
      "Run cycle-count stocktakes, isolate damaged or recalled batches in Quarantine, and redistribute near-expiry stock across branches.",
    category: "inventory",
    readMinutes: 3,
    badge: "Inventory Control",
    targetRole: "Pharmacist, Store Manager",
    actionRoute: "/dashboard/inventory/stocktake",
    actionLabel: "Open Stocktake",
    steps: [
      {
        title: "1. Start a Rack or Store Stocktake",
        content:
          "Open Inventory -> Stocktake, pick a rack or full store scope, and enter physical counts. MediFlow highlights excess/shortage variances before posting adjustments.",
      },
      {
        title: "2. Quarantine Damaged or Recalled Batches",
        content:
          "Move damaged, recalled, or expired stock to Inventory -> Quarantine so it is immediately blocked from POS billing while awaiting supplier return or destruction.",
      },
      {
        title: "3. Redistribute Near-Expiry Stock Across Branches",
        content:
          "Use Reports -> Expiry Redistribution to spot slow-moving near-expiry batches in one branch and transfer them to high-velocity branches.",
      },
    ],
    faqs: [
      {
        q: "Can quarantined stock be accidentally billed at POS?",
        a: "No. Quarantined quantities are excluded from sellable batch stock at the counter.",
      },
    ],
    relatedSlugs: ["stock-transfers", "purchases-grn-and-central-po"],
    keywords: [
      "stocktake",
      "cycle count",
      "quarantine",
      "recall",
      "expiry redistribution",
      "rack",
      "audit",
    ],
  },
  {
    slug: "purchases-grn-and-central-po",
    title: "Purchase Orders, GRN Invoice OCR & Central Purchasing",
    summary:
      "Generate smart POs from Reorder Suggestions, consolidate multi-branch Central POs, inward supplier bills with OCR, and process expiry returns.",
    category: "purchasing",
    readMinutes: 4,
    badge: "Procurement",
    targetRole: "Purchase Manager, Store Manager",
    actionRoute: "/dashboard/purchases/orders",
    actionLabel: "Open Purchase Orders",
    steps: [
      {
        title: "1. Reorder Suggestions & Central Purchasing",
        content:
          "Check Purchases -> Reorder Suggestions for low-stock alerts based on sales velocity, or use Central Purchasing to raise consolidated multi-branch POs.",
      },
      {
        title: "2. Inward Stock via Purchases (GRN) + Invoice OCR",
        content:
          "Open Purchases (GRN) -> New Purchase and upload a photo or PDF of the supplier's tax invoice. AI OCR extracts batch numbers, expiry dates, free qty, schemes, and GST.",
        tip: "Always verify free quantity (scheme) and PTR/MRP margins before approving the GRN.",
      },
      {
        title: "3. Purchase Returns & Expiry Returns",
        content:
          "Return non-moving or expired stock to distributors via Purchase Returns or Expiry Returns to generate supplier debit notes and adjust ITC.",
      },
    ],
    faqs: [
      {
        q: "Does GRN automatically update my GST GSTR-2B reconciliation?",
        a: "Yes. Approved GRNs post inward taxable values and CGST/SGST/IGST directly into the GST Inward register for GSTR-2B matching.",
      },
    ],
    relatedSlugs: ["stock-ocr-and-csv-import", "gst-filing", "accounting-and-day-book"],
    keywords: [
      "purchase",
      "grn",
      "po",
      "reorder",
      "central purchasing",
      "supplier",
      "debit note",
      "expiry return",
      "invoice ocr",
    ],
  },
  {
    slug: "accounting-and-day-book",
    title: "Day Book, Expenses, Ledgers & Financial Statements",
    summary:
      "Review daily double-entry vouchers in Day Book, log expenses, reconcile bank statements, and export Trial Balance, P&L, and Balance Sheet.",
    category: "purchasing",
    readMinutes: 4,
    badge: "Double-Entry",
    targetRole: "Accountant, Business Owner",
    actionRoute: "/dashboard/accounting/day-book",
    actionLabel: "Open Day Book",
    steps: [
      {
        title: "1. Review Daily Vouchers in Day Book",
        content:
          "Every POS sale, credit note, GRN purchase, supplier payment, and receipt automatically posts balanced ledger entries visible in Accounting -> Day Book.",
      },
      {
        title: "2. Record Store Expenses & Customer Receipts",
        content:
          "Log rent, electricity, salaries, and courier expenses under Accounting -> Expenses, and record credit-customer settlements under Receipts / Receivables.",
      },
      {
        title: "3. Bank Reconciliation & Outstanding",
        content:
          "Match UPI/card settlements and bank transfers in Bank Reconciliation, and monitor supplier payables in Outstanding.",
      },
      {
        title: "4. Trial Balance, P&L, Balance Sheet & Year-End",
        content:
          "Inspect real-time Trial Balance, Profit & Loss, Cash Flow, and Balance Sheet, lock closed periods, and run Year-End closing when the financial year ends.",
      },
    ],
    faqs: [
      {
        q: "Do I need to manually post sales into accounting?",
        a: "No. POS bills, returns, and GRNs auto-post double-entry journal vouchers in real time.",
      },
    ],
    relatedSlugs: ["gst-filing", "cash-register-shifts", "purchases-grn-and-central-po"],
    keywords: [
      "accounting",
      "day book",
      "ledger",
      "expense",
      "bank reconciliation",
      "trial balance",
      "profit loss",
      "balance sheet",
      "year end",
    ],
  },
  {
    slug: "gst-filing",
    title: "Monthly GST Filing & GSTR-1/2B Reconciliation",
    summary:
      "Step-by-step instructions for exporting GSTR-1 JSON for GSTN Offline Tool v1.4, matching 2B ITC, and handing off to your CA.",
    category: "compliance",
    readMinutes: 4,
    badge: "Statutory Filing",
    targetRole: "Accountant, Business Owner",
    actionRoute: "/dashboard/accounting/export",
    actionLabel: "Download CA Audit Pack",
    steps: [
      {
        title: "1. Close the Month-End Period",
        content:
          "Ensure all counter cash sessions are reconciled and supplier purchase invoices for the tax period are approved.",
      },
      {
        title: "2. Reconcile Inward ITC with GSTR-2B",
        content:
          "Open GST -> GSTR-2B and upload your portal JSON. MediFlow matches supplier invoices within 16(2)(aa) tolerance and flags blocked ITC or missing filings.",
      },
      {
        title: "3. Export Official GSTR-1 JSON",
        content:
          "Open CA Audit Pack in Accounting. Click 'Export GSTR-1 JSON'. The file strictly conforms to GSTN Offline Tool v1.4 (B2B, B2CS, CDNR, HSN data).",
      },
      {
        title: "4. Hand Off Audit Pack to CA",
        content:
          "Download the complete ZIP containing Sales Register CSV, Purchase Register CSV with ITC flags, Trial Balance, and Stock Valuation.",
      },
    ],
    faqs: [
      {
        q: "Does the GSTR-1 JSON require manual corrections?",
        a: "No. The schema is pre-validated with GSTN Offline Tool specs including UQC, state codes, and rate breakdowns.",
      },
    ],
    relatedSlugs: ["sales-returns", "stock-transfers", "accounting-and-day-book"],
    keywords: ["gst", "gstr1", "gstr2b", "itc", "tax", "offline tool", "audit", "ca pack"],
  },
  {
    slug: "narcotics-compliance",
    title: "Schedule H1, Narcotics & Drug License Compliance",
    summary:
      "Drugs and Cosmetics Rule 65(9)(b) statutory record keeping for Habit Forming, Schedule X, H1 dispensations, and Drug License expiry tracking.",
    category: "compliance",
    readMinutes: 3,
    badge: "D&C Rules 1945",
    targetRole: "Dispensing Pharmacist, Owner",
    actionRoute: "/dashboard/compliance/export",
    actionLabel: "Download Inspector Pack",
    steps: [
      {
        title: "1. Automated Schedule Flagging at POS",
        content:
          "When a Schedule H, H1, X, or Narcotic formulation is added to the cart, MediFlow requires prescriber details and patient info inside the Doctor & Prescription panel.",
      },
      {
        title: "2. Register Entry Commitment",
        content:
          "Each completed transaction writes directly to the immutable statutory register with patient details, doctor registration number, batch, and dispensing pharmacist.",
      },
      {
        title: "3. Drug License Renewal Alerts",
        content:
          "Track Form 20, 21, and 20B/21B licenses per branch in Compliance -> Licenses & Renewals. Dashboard alerts warn before any branch license expires.",
      },
      {
        title: "4. One-Click Drug Inspector Export",
        content:
          "When a Drug Inspector visits, go to Compliance -> Export. Click 'Download Inspector Pack' for clean Form 20/21/65(9)(b) CSV registers.",
      },
    ],
    faqs: [
      {
        q: "How long are Schedule H1 registers retained?",
        a: "By Indian law, Schedule H1 registers must be preserved for a minimum of 3 years from the date of entry.",
      },
    ],
    relatedSlugs: ["first-bill", "gst-filing"],
    keywords: [
      "schedule h",
      "schedule h1",
      "narcotics",
      "drug inspector",
      "rule 65",
      "pharmacist",
      "drug license",
      "form 20",
      "form 21",
    ],
  },
  {
    slug: "ask-mediflow-ai",
    title: "Ask MediFlow AI Assistant (Ctrl+J) & Command Palette",
    summary:
      "Use the movable Ask MediFlow AI assistant to query live store metrics, expiring stock, and operational questions from anywhere in the app.",
    category: "ai-tools",
    readMinutes: 2,
    badge: "AI Assistant",
    targetRole: "All Staff, Store Manager",
    actionRoute: "/dashboard",
    actionLabel: "Go to Overview",
    steps: [
      {
        title: "1. Open Ask MediFlow Anywhere",
        content:
          "Press Ctrl+J (or click the floating 'Ask MediFlow' pill) from any dashboard screen to open the AI assistant.",
        shortcutKey: "Ctrl+J",
      },
      {
        title: "2. Drag & Position the Pill Freely",
        content:
          "Drag the 'Ask MediFlow' pill anywhere on your screen so it never covers buttons or tables. Your preferred position is remembered automatically.",
      },
      {
        title: "3. Ask Natural-Language Store Questions",
        content:
          "Ask about today's revenue, low-stock medicines, near-expiry batches, GST summaries, or how to perform a MediFlow workflow.",
      },
      {
        title: "4. Jump Faster with Command Palette",
        content:
          "Press Cmd+K / Ctrl+K (or click the top search bar) to jump straight to any screen, setting, or Ask MediFlow.",
        shortcutKey: "Ctrl+K / Cmd+K",
      },
    ],
    faqs: [
      {
        q: "Can I move the Ask MediFlow button if it overlaps a sidebar item?",
        a: "Yes. Grab and drag the Ask MediFlow pill anywhere on the screen; it snaps cleanly inside the viewport and remembers its position.",
      },
    ],
    relatedSlugs: ["custom-billing-templates", "stock-ocr-and-csv-import"],
    keywords: [
      "ai",
      "ask mediflow",
      "assistant",
      "ctrl+j",
      "command palette",
      "draggable",
      "movable",
      "chat",
    ],
  },
  {
    slug: "custom-billing-templates",
    title: "Custom HTML Billing Templates, Bill OCR & Printer Defaults",
    summary:
      "Design custom A4 or 80mm invoices by scanning a physical bill photo via OCR, uploading HTML, editing placeholders, and setting branch printer defaults.",
    category: "ai-tools",
    readMinutes: 4,
    badge: "OCR & Custom HTML",
    targetRole: "Store Manager, Owner",
    actionRoute: "/dashboard/settings/printers",
    actionLabel: "Open Printer & Template Settings",
    steps: [
      {
        title: "1. Choose A4 GST Invoice or 80mm Thermal Slip",
        content:
          "Open Settings -> Billing Templates & Printer Settings and toggle between A4 GST Invoice and 80mm Thermal Slip formats for the selected branch.",
      },
      {
        title: "2. Scan a Physical Bill Photo (OCR) or Upload .html",
        content:
          "Click 'Scan Bill Photo (OCR)' to convert a photo/PDF of your existing printed pharmacy bill into clean HTML + CSS, or upload your own .html template.",
        tip: "Click any {{placeholder}} chip below the editor to insert store, patient, batch, or GST totals at your cursor.",
      },
      {
        title: "3. Verify Live Sample Preview & Test Print",
        content:
          "Inspect the live rendered preview on the right (use Fit / 100% zoom for A4), click 'Test Print' to verify paper margins, then click 'Save & Activate'.",
      },
      {
        title: "4. Configure Branch Printer Defaults",
        content:
          "Switch to the 'Branch Printer Defaults' tab to set whether the branch defaults to 80mm Continuous, 58mm Mini Roll, or A4 GST Tax Invoice at POS checkout.",
      },
    ],
    faqs: [
      {
        q: "Can I revert to MediFlow's standard invoice anytime?",
        a: "Yes. Click 'Use Default' on the MediFlow Built-in Default card to restore the standard GST-compliant layout immediately.",
      },
    ],
    relatedSlugs: ["first-bill", "stock-ocr-and-csv-import"],
    keywords: [
      "printer",
      "template",
      "html",
      "ocr",
      "80mm",
      "58mm",
      "a4",
      "thermal",
      "receipt design",
      "cash drawer",
    ],
  },
  {
    slug: "promise-orders-and-whatsapp",
    title: "Promise Orders, Refill Reminders & WhatsApp Receipts",
    summary:
      "Capture out-of-stock patient demand with Promise Orders, automate chronic refill reminders, and send WhatsApp invoices.",
    category: "ai-tools",
    readMinutes: 3,
    badge: "Patient Retention",
    targetRole: "Cashier, Pharmacist, Store Manager",
    actionRoute: "/dashboard/sales/promise-orders",
    actionLabel: "Open Promise Orders",
    steps: [
      {
        title: "1. Log a Promise Order for Out-of-Stock Items",
        content:
          "If a requested medicine is out of stock at POS, create a Promise Order with the patient's phone number and expected arrival date so you never lose the sale.",
      },
      {
        title: "2. Send Automated WhatsApp Bills & Updates",
        content:
          "Configure WhatsApp templates under Settings -> WhatsApp and monitor delivery status in the WhatsApp dashboard.",
      },
      {
        title: "3. Chronic Medicine Refill Reminders",
        content:
          "Track upcoming monthly refills in Reminders so staff can message chronic-care patients before their strip runs out.",
      },
    ],
    faqs: [
      {
        q: "How is customer messaging consent handled?",
        a: "Customer privacy preferences and opt-outs can be managed from each customer's Privacy page and Settings -> Privacy.",
      },
    ],
    relatedSlugs: ["first-bill", "margins-and-discounts"],
    keywords: [
      "promise order",
      "whatsapp",
      "refill",
      "reminder",
      "out of stock",
      "chronic",
      "consent",
    ],
  },
  {
    slug: "offline-mode",
    title: "Counter Continuity & Offline Auto-Sync",
    summary:
      "How MediFlow protects billing when broadband drops, utilizing local SQLite/IndexedDB caching and conflict-free sync recovery.",
    category: "offline",
    readMinutes: 3,
    badge: "Zero-Downtime",
    targetRole: "All Counter Staff",
    actionRoute: "/dashboard/sales/pos",
    actionLabel: "Inspect POS Counter",
    steps: [
      {
        title: "1. Automatic Offline Detection",
        content:
          "If the internet connection drops, MediFlow instantly switches to Offline Counter Mode. The header status badge updates to indicate offline continuity.",
      },
      {
        title: "2. Local Product & Price Lookup",
        content:
          "The local SQLite / browser store holds the branch's medicine catalog, batch stock, and customer balances for zero-latency queries.",
      },
      {
        title: "3. Provisional Offline Invoicing",
        content:
          "Bills continue printing with provisional offline invoice numbers. Stock deductions are reserved locally so the counter never stops.",
      },
      {
        title: "4. Automatic Sync on Reconnection",
        content:
          "As soon as connectivity restores, MediFlow's background sync engine batches pending sales, reserves official 16-char GST numbers, and updates cloud ledgers.",
      },
    ],
    faqs: [
      {
        q: "Will I lose sales if the computer restarts during an outage?",
        a: "No. Every line item is committed locally before the receipt prints and syncs automatically once online.",
      },
    ],
    relatedSlugs: ["first-bill", "stock-transfers"],
    keywords: ["offline", "sync", "sqlite", "connectivity", "outage", "resilience"],
  },
  {
    slug: "control-room-and-roles",
    title: "Control Room Policies, Languages & Custom Roles",
    summary:
      "Configure store-wide billing guardrails (below-cost, DPCO ceiling, negative stock), Marg Classic keyboard preset, multilingual bills, and granular cost/margin RBAC roles.",
    category: "compliance",
    readMinutes: 4,
    badge: "Store Governance",
    targetRole: "Owner, Store Manager",
    actionRoute: "/dashboard/settings/control-room",
    actionLabel: "Open Control Room",
    steps: [
      {
        title: "1. Billing & Stock Guardrails",
        content:
          "Open Settings > Control Room to configure Below-Cost Policy (off / warn / block), NPPA DPCO Ceiling Price Policy (off / warn / block), and Negative Stock Policy (block / warn / allow).",
        callout:
          "Blocking policies prevent accidental margin loss or statutory DPCO overcharging at the POS counter unless a manager override permission is granted.",
      },
      {
        title: "2. Keyboard Preset, UPI VPA & Multilingual Printing",
        content:
          "Choose between MediFlow Keys and Marg Classic (End / Ctrl+W / Alt+Backspace), configure your Store UPI VPA for counter QR codes, and select Thermal 80mm, 58mm, A5, or A4 in English, Hindi, Marathi, Gujarati, Tamil, or Bengali.",
      },
      {
        title: "3. Custom Roles & Cost/Margin Redaction",
        content:
          "Open Settings > Roles & Access Control to create custom roles or inspect built-in permissions. Users without 'cost.view' or 'margin.view' automatically see purchase costs and margins redacted across inventory and batch screens.",
      },
    ],
    faqs: [
      {
        q: "Can cashiers see our purchase rate or profit margin?",
        a: "No. Purchase rates and valuation totals are redacted server-side unless the user's role includes cost.view / margin.view.",
      },
    ],
    relatedSlugs: ["first-bill", "narcotics-compliance"],
    keywords: ["control room", "dpco", "below cost", "negative stock", "marg", "roles", "rbac", "language", "upi"],
  },
  {
    slug: "vouchers-and-pdc",
    title: "Manual Vouchers (Contra, Journal, Notes) & PDC Register",
    summary:
      "Post double-entry Journal, Contra, and Debit/Credit Notes, and manage inward/outward Post-Dated Cheques from receipt through pay-in-slip, clearance, or dishonour.",
    category: "purchasing",
    readMinutes: 4,
    badge: "Double-Entry",
    targetRole: "Accountant, Owner",
    actionRoute: "/dashboard/accounting/vouchers",
    actionLabel: "Open Vouchers",
    steps: [
      {
        title: "1. Post Journal, Contra & Debit/Credit Notes",
        content:
          "Navigate to Accounting > Vouchers & Notes (or press F4–F7 on the vouchers screen) to record Cash-to-Bank Contra transfers, manual Journal adjustments, or standalone financial Debit/Credit Notes.",
        shortcutKey: "F4 / F5 / F6 / F7",
      },
      {
        title: "2. Register Inward & Outward Post-Dated Cheques",
        content:
          "Open Accounting > PDC Cheques to log customer (inward) or supplier (outward) cheques with cheque number, cheque date, bank name, and amount.",
      },
      {
        title: "3. Pay-In-Slip, Bank Clearance & Dishonour Reversal",
        content:
          "Mark cheques as Deposited with a Pay-In-Slip number, then Clear them to auto-post the double-entry bank ledger voucher, or mark Dishonoured with a reason.",
      },
    ],
    faqs: [
      {
        q: "Does clearing a PDC update the accounting ledger automatically?",
        a: "Yes. Clearing a PDC posts a balanced journal entry and links its entry number directly to the cheque record.",
      },
    ],
    relatedSlugs: ["accounting-and-day-book", "wholesale-challans-and-b2b"],
    keywords: ["voucher", "contra", "journal", "debit note", "credit note", "pdc", "cheque", "bank"],
  },
  {
    slug: "wholesale-challans-and-b2b",
    title: "Wholesale Delivery Challans, B2B Dispatch & DL Guards",
    summary:
      "Create B2B wholesale delivery challans with route/salesman/LR tracking, monitor ₹50,000 e-Way Bill thresholds, and enforce buyer Drug License expiry checks.",
    category: "billing",
    readMinutes: 3,
    badge: "B2B Wholesale",
    targetRole: "Wholesale Operator, Manager",
    actionRoute: "/dashboard/wholesale",
    actionLabel: "Open Wholesale Challans",
    steps: [
      {
        title: "1. Create a Wholesale Delivery Challan",
        content:
          "Open Sales > Wholesale Challans to enter buyer details, GSTIN, Route, Salesman, and LR/Transport number along with PTR rates, free quantities, and GST.",
      },
      {
        title: "2. E-Way Bill Threshold & B2B Drug License Guard",
        content:
          "MediFlow flags challans crossing the ₹50,000 e-Way Bill threshold automatically. During B2B sales, customers with GSTIN and an expired Drug License are blocked before invoice creation.",
        callout:
          "Keep B2B customer Drug License numbers and expiry dates updated under CRM > Customers.",
      },
    ],
    faqs: [
      {
        q: "Can I track route and salesman dispatch on challans?",
        a: "Yes, every saved challan stores Route, Salesman, and LR/Transport details for dispatch reconciliation.",
      },
    ],
    relatedSlugs: ["first-bill", "gst-ims-tds-and-tally"],
    keywords: ["wholesale", "challan", "b2b", "eway bill", "drug license", "route", "salesman", "lr"],
  },
  {
    slug: "gst-ims-tds-and-tally",
    title: "GST IMS, Composition Tax, TDS Register & Tally XML",
    summary:
      "Calculate CMP-08 composition tax, record Income-tax TDS deductions (194Q/194H/194C/194J), review GSTR-9 annual summaries, and export TallyPrime XML.",
    category: "compliance",
    readMinutes: 4,
    badge: "Tax & ERP Export",
    targetRole: "Accountant, CA, Owner",
    actionRoute: "/dashboard/gst/ims-and-tax",
    actionLabel: "Open IMS & Tax Workbench",
    steps: [
      {
        title: "1. Composition Tax (CMP-08) & TDS Register",
        content:
          "Open GST & Tax > IMS, TDS & Composition to compute 1% composition turnover tax (0.5% CGST + 0.5% SGST) and record TDS entries under sections 194Q, 194H, 194C, and 194J.",
      },
      {
        title: "2. 30-Day E-Invoice Reporting Window Guard",
        content:
          "For B2B invoices subject to the 30-day IRP reporting rule, MediFlow validates invoice age before generating IRN payloads.",
      },
      {
        title: "3. TallyPrime XML & GSTR-9 Annual Summary",
        content:
          "Open Accounting > Tally / CA Export to download TallyPrime-compatible voucher XML files alongside GSTR-1/2B/3B/9 schedules.",
      },
    ],
    faqs: [
      {
        q: "What happens if a vendor has no PAN during TDS entry?",
        a: "Uncheck 'Has PAN' in the TDS calculator to apply the higher statutory non-PAN TDS rate automatically.",
      },
    ],
    relatedSlugs: ["gst-filing", "accounting-and-day-book"],
    keywords: ["ims", "tds", "194q", "194h", "composition", "cmp-08", "gstr-9", "tally", "xml"],
  },
  {
    slug: "clinical-and-owner-reports",
    title: "Anti-TB Register, Patient/Doctor Analytics, Owner Pulse & Marg Migration",
    summary:
      "Export statutory Anti-TB registers, inspect Doctor × Company and Business Analysis pivots, track multi-store Owner Pulse vs Marg TCO, and import Marg open bills & PDCs.",
    category: "inventory",
    readMinutes: 4,
    badge: "Analytics & Migration",
    targetRole: "Owner, Pharmacist, Manager",
    actionRoute: "/dashboard/reports/owner-pulse",
    actionLabel: "Open Owner Pulse",
    steps: [
      {
        title: "1. Statutory Anti-TB & Patient/Doctor Reports",
        content:
          "Use Reports > Anti-TB Register to export Rifampicin/Isoniazid/Pyrazinamide/Ethambutol dispensing CSVs, and Reports > Patient & Doctor Sales for prescriber and Doctor × Company breakdowns.",
      },
      {
        title: "2. Business Analysis Pivot & eOwner Pulse",
        content:
          "Open Reports > Business Analysis to pivot Turnover, COGS, and Gross Margin % by Manufacturer, Category, or Medicine. Open Reports > Owner Pulse for live multi-store sales, credit, and near-expiry exposure.",
      },
      {
        title: "3. Marg ERP Deep Migration (Open Bills & PDCs)",
        content:
          "Open Import / Settings > Marg Migration to parse Marg outstanding receivable/payable CSVs and commit Post-Dated Cheques directly into MediFlow's PDC Register.",
      },
    ],
    faqs: [
      {
        q: "Does distributor invoice import remember previous medicine mappings?",
        a: "Yes. Confirming a distributor bill item saves the supplier-to-medicine mapping in supplier_item_map for future GRN imports.",
      },
    ],
    relatedSlugs: ["narcotics-compliance", "vouchers-and-pdc"],
    keywords: ["anti-tb", "tb register", "patient", "doctor", "business analysis", "owner pulse", "tco", "marg migration"],
  },
];

export function getAllHelpArticles(): HelpArticle[] {
  return HELP_ARTICLES;
}

export function getHelpArticleBySlug(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

export function searchHelpArticles(
  query: string,
  category?: HelpCategory | "all"
): HelpArticle[] {
  const q = query.toLowerCase().trim();
  return HELP_ARTICLES.filter((article) => {
    if (category && category !== "all" && article.category !== category) return false;
    if (!q) return true;
    return (
      article.title.toLowerCase().includes(q) ||
      article.summary.toLowerCase().includes(q) ||
      article.keywords.some((kw) => kw.toLowerCase().includes(q)) ||
      article.steps.some(
        (s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)
      )
    );
  });
}
