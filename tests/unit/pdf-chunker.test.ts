import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { parseApiJsonResponse, splitPdfIntoChunks } from "@/lib/pdf-chunker";

describe("pdf-chunker", () => {
  it("splits a 19-page PDF into 7 chunks of at most 3 pages", async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 19; i++) {
      doc.addPage([200, 200]);
    }
    const bytes = await doc.save();
    const file = new File([new Uint8Array(bytes)], "stock-19.pdf", {
      type: "application/pdf",
    });

    const chunks = await splitPdfIntoChunks(file, 3);
    expect(chunks).toHaveLength(7);
    expect(chunks[0]).toMatchObject({ startPage: 1, endPage: 3, totalPages: 19 });
    expect(chunks[5]).toMatchObject({ startPage: 16, endPage: 18, totalPages: 19 });
    expect(chunks[6]).toMatchObject({ startPage: 19, endPage: 19, totalPages: 19 });

    const lastLoaded = await PDFDocument.load(await chunks[6].file.arrayBuffer());
    expect(lastLoaded.getPageCount()).toBe(1);
  });

  it("returns non-PDF files as a single chunk without modification", async () => {
    const img = new File([new Uint8Array([0xff, 0xd8, 0xff])], "shelf.jpg", {
      type: "image/jpeg",
    });
    const chunks = await splitPdfIntoChunks(img, 3);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].file).toBe(img);
  });

  it("parses plain-text Vercel 504 and 413 responses safely without throwing JSON syntax errors", async () => {
    const res504 = new Response("An error occurred with your deployment", {
      status: 504,
      headers: { "content-type": "text/plain" },
    });
    const parsed504 = await parseApiJsonResponse(res504);
    expect(parsed504.ok).toBe(false);
    expect(parsed504.errorMessage).toContain("timed out");

    const res413 = new Response("Request Entity Too Large", { status: 413 });
    const parsed413 = await parseApiJsonResponse(res413);
    expect(parsed413.ok).toBe(false);
    expect(parsed413.errorMessage).toContain("4.5 MB");
  });
});

