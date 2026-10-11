import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

 const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

  const mono = JetBrains_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MediFlow — Pharmacy Operating System",
    template: "%s · MediFlow",
  },
  description:
    "Billing, batch-level inventory, GST purchases and double-entry accounting for modern Indian pharmacies.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
