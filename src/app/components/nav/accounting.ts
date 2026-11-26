import { BookOpen, BookOpenText, Building2, CalendarCheck, FilePlus2, FileSpreadsheet, HandCoins, Landmark, Lock, ReceiptText, Scale, Users } from "lucide-react";
import type { NavItem } from "./types";

export const accountingNav: NavItem[] = [
  { group: "finance", order: 10, href: "/dashboard/accounting", label: "Accounting", icon: BookOpenText, description: "Overview & financial statements", permission: "accounting.view" },
  { group: "finance", order: 11, href: "/dashboard/accounting/vouchers", label: "Vouchers (JV/Contra)", icon: FilePlus2, description: "Manual Journal, Contra & Debit/Credit notes", permission: "accounting.post" },
  { group: "finance", order: 12, href: "/dashboard/accounting/day-book", label: "Day Book", icon: BookOpen, description: "Chronological posted journal register", permission: "accounting.view" },
  { group: "finance", order: 13, href: "/dashboard/accounting/pdc", label: "PDC Register", icon: Landmark, description: "Post-dated cheques, pay-in-slips & dishonour", permission: "accounting.view" },
  { group: "finance", order: 14, href: "/dashboard/accounting/ledger", label: "Ledgers", icon: FileSpreadsheet, description: "Account-wise running balance statements", permission: "accounting.view" },
  { group: "finance", order: 16, href: "/dashboard/accounting/receivables", label: "Receivables", icon: Users, description: "Credit control & receivables ageing", permission: "accounting.view" },
  { group: "finance", order: 18, href: "/dashboard/accounting/receipts", label: "Receipts", icon: HandCoins, description: "Record money received from customers", permission: "accounting.post" },
  { group: "finance", order: 20, href: "/dashboard/accounting/expenses", label: "Expenses", icon: ReceiptText, description: "Operating expenses & payout vouchers", permission: "accounting.view" },
  { group: "finance", order: 22, href: "/dashboard/accounting/bank-reconciliation", label: "Bank reconciliation", icon: Building2, description: "Match bank & UPI statements against ledger entries", permission: "accounting.view" },
  { group: "finance", order: 24, href: "/dashboard/accounting/periods", label: "Period Lock", icon: Lock, description: "Monthly period lock & closing audit trail", permission: "accounting.view" },
  { group: "finance", order: 26, href: "/dashboard/accounting/opening-balances", label: "Opening Balances", icon: Scale, description: "Subledger balances & equity reconciliation", permission: "accounting.view" },
  { group: "finance", order: 28, href: "/dashboard/accounting/year-end", label: "Year-End Rollover", icon: CalendarCheck, description: "Closing-stock valuation & sequence rollover", permission: "accounting.view" },
];
