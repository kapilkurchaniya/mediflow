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

  it("scales dynamically for large signed JWT payloads", () => {
    // Typical NIC signed QR payload is a 400-500 char JWT
    const mockJwt = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9." +
      "eyJkYXRhIjoic2VsbGVyR3N0aW49MjdHU1BURTA5ODVGMVo1LGJ1eWVyR3N0aW49MjRBQUFDQzEyMDZEMVpNLGRvY05vPUlOVi0yMDI2LTAwMSxkb2NEYXRlPTA0LzExLzIwMjYsdG90VmFsPTE0OTkuOTksaXJuPTZENjE1RjE5M0FFNTQyOUU5RUEzNjQ3QkI5RDQxNDM1RTE0REU2NzE5RkU4NTFDQkZGNjg4RTA0Q0EyMTU5QkMifQ." +
      "c2lnbmF0dXJlX2J5dGVzX3NhbXBsZV9mb3JfdGVzdF9wdXJwb3Nlc19vbmx5X3BsYWNlaG9sZGVy";
    const matrix = generateQrMatrix(mockJwt);
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
