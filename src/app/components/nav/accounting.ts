import { BookOpenText, Building2, HandCoins, ReceiptText } from "lucide-react";
import type { NavItem } from "./types";

export const accountingNav: NavItem[] = [
  { group: "finance", order: 10, href: "/dashboard/accounting", label: "Accounting", icon: BookOpenText, description: "Day book, ledgers & tax summaries", permission: "accounting.view" },
  { group: "finance", order: 15, href: "/dashboard/accounting/receipts", label: "Receipts", icon: HandCoins, description: "Record money received from customers", permission: "accounting.post" },
  { group: "finance", order: 18, href: "/dashboard/accounting/expenses", label: "Expenses", icon: ReceiptText, description: "Operating expenses & payout vouchers", permission: "accounting.view" },
  { group: "finance", order: 20, href: "/dashboard/accounting/bank-reconciliation", label: "Bank reconciliation", icon: Building2, permission: "accounting.view" },
];
