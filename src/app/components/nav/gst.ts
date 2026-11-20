import { FileCheck, FileSpreadsheet, Landmark, QrCode, ReceiptText, Truck } from "lucide-react";
import type { NavItem } from "./types";

export const gstNav: NavItem[] = [
  { group: "gst", order: 10, href: "/dashboard/gst", label: "GST Overview", icon: Landmark, exact: true, description: "Monthly tax liability, ITC netting & filing readiness summary", permission: "gst.view" },
  { group: "gst", order: 20, href: "/dashboard/gst/outward", label: "Outward (GSTR-1)", icon: ReceiptText, description: "B2B, B2C, HSN summary & credit-note outward tax register", permission: "gst.view" },
  { group: "gst", order: 30, href: "/dashboard/gst/inward", label: "Inward (ITC)", icon: FileSpreadsheet, description: "Purchase input tax credit register from supplier GRNs", permission: "gst.view" },
  { group: "gst", order: 35, href: "/dashboard/gst/gstr2b", label: "GSTR-2B & IMS", icon: FileCheck, description: "Reconcile supplier invoices with GST portal GSTR-2B & IMS", permission: "gst.view" },
  { group: "gst", order: 40, href: "/dashboard/gst/e-invoice", label: "E-Invoice & E-Way", icon: QrCode, description: "NIC IRN E-Invoice generation, QR codes & status tracking", permission: "gst.view" },
  { group: "gst", order: 45, href: "/dashboard/gst/e-way-bill", label: "E-Way Bills", icon: Truck, description: "Generate, update vehicle details & print GST E-Way Bills", permission: "gst.view" },
  { group: "gst", order: 50, href: "/dashboard/gst/returns", label: "Returns & Filing", icon: Landmark, description: "Export GSTR-1 JSON / CSV & track monthly GST return filing", permission: "gst.view" },
];
