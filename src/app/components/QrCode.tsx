/**
 * src/app/components/QrCode.tsx
 *
 * Lightweight SVG QR Code Component.
 * Supports both Client and Server Components without external dependencies.
 *
 * Lane B (B5.1)
 */

import { generateQrSvg } from "@/lib/qr-code";

interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
  color?: string;
  bgColor?: string;
}

export function QrCode({
  value,
  size = 140,
  className = "",
  color = "#000000",
  bgColor = "#ffffff",
}: QrCodeProps) {
  if (!value) return null;

  let svgHtml: string | null = null;
  try {
    svgHtml = generateQrSvg(value, {
      size,
      color,
      bgColor,
      margin: 2,
    });
  } catch (err) {
    console.error("Failed to render QR Code SVG:", err);
  }

  if (!svgHtml) {
    return (
      <div
        className={`border border-dashed border-ink-300 flex items-center justify-center text-[10px] text-ink-500 font-mono ${className}`}
        style={{ width: size, height: size }}
      >
        [QR Render Error]
      </div>
    );
  }

  return (
    <div
      className={`inline-block select-none ${className}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
}

