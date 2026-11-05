import { describe, expect, it } from "vitest";
import { generateQrMatrix, generateQrSvg } from "@/lib/qr-code";

describe("QR Code Generator (ISO/IEC 18004)", () => {
  it("generates valid square boolean matrix for simple strings", () => {
    const matrix = generateQrMatrix("MEDIFLOW-TEST");
    expect(matrix.length).toBeGreaterThan(20);
    expect(matrix[0]!.length).toBe(matrix.length);
    // Finders at (0,0), (0, size-7), (size-7, 0) should have dark centers
    expect(matrix[3]![3]).toBe(true);
  });

  it("scales dynamically for large signed QR payloads", () => {
    // Typical NIC signed QR payload is a 400-500 char string
    const mockPayload = "MEDIFLOW-NIC-SIGNED-QR-" + "A".repeat(450);
    const matrix = generateQrMatrix(mockPayload);
    // Large payloads require version > 10 (size > 57x57)
    expect(matrix.length).toBeGreaterThanOrEqual(57);
    expect(matrix[0]!.length).toBe(matrix.length);
  });

  it("generates clean SVG markup with viewBox and path", () => {
    const svg = generateQrSvg("https://mediflow.in", { size: 180 });
    expect(svg).toContain("<svg xmlns=");
    expect(svg).toContain('width="180"');
    expect(svg).toContain('height="180"');
    expect(svg).toContain("<path d=");
    expect(svg).toContain("</svg>");
  });
});

