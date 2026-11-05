import { FileCheck, FileSpreadsheet, Landmark, QrCode, ReceiptText, Truck } from "lucide-react";
import type { NavItem } from "./types";

export const gstNav: NavItem[] = [
  { group: "gst", order: 10, href: "/dashboard/gst", label: "GST Overview", icon: Landmark, exact: true, permission: "gst.view" },
  { group: "gst", order: 20, href: "/dashboard/gst/outward", label: "Outward (GSTR-1)", icon: ReceiptText, permission: "gst.view" },
  { group: "gst", order: 30, href: "/dashboard/gst/inward", label: "Inward (ITC)", icon: FileSpreadsheet, permission: "gst.view" },
  { group: "gst", order: 35, href: "/dashboard/gst/gstr2b", label: "GSTR-2B & IMS", icon: FileCheck, permission: "gst.view" },
  { group: "gst", order: 40, href: "/dashboard/gst/e-invoice", label: "E-Invoice & E-Way", icon: QrCode, permission: "gst.view" },
  { group: "gst", order: 45, href: "/dashboard/gst/e-way-bill", label: "E-Way Bills", icon: Truck, permission: "gst.view" },
  { group: "gst", order: 50, href: "/dashboard/gst/returns", label: "Returns & Filing", icon: Landmark, permission: "gst.view" },
];
