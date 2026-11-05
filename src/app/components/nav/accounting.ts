import { BookOpen, BookOpenText, Building2, FileSpreadsheet, HandCoins, ReceiptText, Users } from "lucide-react";
import type { NavItem } from "./types";

export const accountingNav: NavItem[] = [
  { group: "finance", order: 10, href: "/dashboard/accounting", label: "Accounting", icon: BookOpenText, description: "Overview & financial statements", permission: "accounting.view" },
  { group: "finance", order: 12, href: "/dashboard/accounting/day-book", label: "Day Book", icon: BookOpen, description: "Chronological posted journal register", permission: "accounting.view" },
  { group: "finance", order: 14, href: "/dashboard/accounting/ledger", label: "Ledgers", icon: FileSpreadsheet, description: "Account-wise running balance statements", permission: "accounting.view" },
  { group: "finance", order: 16, href: "/dashboard/accounting/receivables", label: "Receivables", icon: Users, description: "Credit control & receivables ageing", permission: "accounting.view" },
  { group: "finance", order: 18, href: "/dashboard/accounting/receipts", label: "Receipts", icon: HandCoins, description: "Record money received from customers", permission: "accounting.post" },
  { group: "finance", order: 20, href: "/dashboard/accounting/expenses", label: "Expenses", icon: ReceiptText, description: "Operating expenses & payout vouchers", permission: "accounting.view" },
  { group: "finance", order: 22, href: "/dashboard/accounting/bank-reconciliation", label: "Bank reconciliation", icon: Building2, permission: "accounting.view" },
];
