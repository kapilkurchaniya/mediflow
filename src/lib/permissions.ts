/**
 * Granular permission catalogue (blueprint §7). Roles map to these strings; code checks
 * permissions, never role names.
 */
export const PERMISSIONS = {
  "dashboard.view": "View dashboard",
  "sale.view": "View sales",
  "sale.create": "Create sales (POS)",
  "sale.cancel": "Cancel sales",
  "sale.return": "Process sale returns",
  "sale.discount_override": "Give discounts above limit",
  "inventory.view": "View inventory",
  "inventory.adjust": "Adjust stock",
  "inventory.transfer": "Transfer stock",
  "medicine.view": "View medicines",
  "medicine.manage": "Create/edit medicines",
  "purchase.view": "View purchases",
  "purchase.create": "Create purchases",
  "purchase.approve": "Approve purchase orders",
  "purchase.return": "Purchase returns",
  "supplier.view": "View suppliers",
  "supplier.manage": "Manage suppliers",
  "customer.view": "View customers",
  "customer.manage": "Manage customers",
  "customer.credit": "Allow credit sales",
  "accounting.view": "View accounts",
  "accounting.post": "Post payments/receipts/vouchers",
  "accounting.period.lock": "Lock accounting periods",
  "accounting.period.reopen": "Reopen locked accounting periods",
  "gst.view": "View GST reports",
  "report.view": "View reports",
  "report.export": "Export reports",
  "register.manage": "Open/close cash register",
  "prescription.approve": "Approve prescription-linked sales",
  "ai.use": "Use AI assistant",
  "voice.execute": "Use voice commands",
  "voice.financial_action": "Confirm financial actions via voice",
  "settings.manage": "Manage business settings & stores",
  "user.manage": "Manage users & roles",
  "audit.view": "View audit logs",
  "store.manage": "Create/edit stores and branches",
  "store.switch_any": "Switch to any store, ignoring the allowed-stores list",
  "inventory.transfer_receive": "Receive stock transfers",
  "report.all_stores": "View reports across all stores",
  "api_key.manage": "Create and revoke API keys",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export interface RoleTemplate {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}

const view: Permission[] = ["dashboard.view", "medicine.view", "inventory.view", "customer.view", "supplier.view"];

export const SYSTEM_ROLES: RoleTemplate[] = [
  { key: "owner", name: "Owner", description: "Full business access", permissions: ALL_PERMISSIONS },
  {
    key: "manager",
    name: "Store Manager",
    description: "Inventory, staff and operational reports",
    permissions: ALL_PERMISSIONS.filter(
      (p) =>
        ![
          "user.manage",
          "settings.manage",
          "store.manage",
          "store.switch_any",
          "report.all_stores",
          "api_key.manage",
          "accounting.period.lock",
          "accounting.period.reopen",
        ].includes(p),
    ),
  },
  {
    key: "pharmacist",
    name: "Pharmacist",
    description: "Billing, medicines and prescription workflows",
    permissions: [...view, "sale.view", "sale.create", "sale.return", "medicine.manage", "customer.manage", "customer.credit", "prescription.approve", "register.manage", "ai.use", "voice.execute"],
  },
  {
    key: "cashier",
    name: "Cashier",
    description: "POS and payment collection",
    permissions: ["dashboard.view", "medicine.view", "inventory.view", "customer.view", "sale.view", "sale.create", "customer.manage", "register.manage", "voice.execute"],
  },
  {
    key: "purchase_manager",
    name: "Purchase Manager",
    description: "Suppliers, purchase orders and purchasing",
    permissions: [...view, "purchase.view", "purchase.create", "purchase.approve", "purchase.return", "supplier.manage", "medicine.manage", "report.view", "ai.use"],
  },
  {
    key: "accountant",
    name: "Accountant",
    description: "Ledger, payments, GST and reports",
    permissions: [...view, "sale.view", "purchase.view", "accounting.view", "accounting.post", "gst.view", "report.view", "report.export"],
  },
  {
    key: "auditor",
    name: "Auditor",
    description: "Read-only reports and audit logs",
    permissions: [...view, "sale.view", "purchase.view", "accounting.view", "gst.view", "report.view", "audit.view"],
  },
];
