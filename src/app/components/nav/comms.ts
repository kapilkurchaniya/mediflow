import { Bell, MessageSquare } from "lucide-react";
import type { NavItem } from "./types";

export const commsNav: NavItem[] = [
  { group: "comms", order: 10, href: "/dashboard/whatsapp", label: "WhatsApp inbox", icon: MessageSquare, description: "Two-way patient WhatsApp chats, bills & templates", permission: "customer.manage" },
  { group: "comms", order: 20, href: "/dashboard/reminders", label: "Patient reminders", icon: Bell, description: "Automated medicine refill & dosage follow-up alerts", permission: "customer.manage" },
];
