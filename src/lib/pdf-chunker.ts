export interface PdfChunk {
  file: File;
  startPage: number;
  endPage: number;
  totalPages: number;
}

/**
 * Splits a multi-page PDF into smaller PDF files (default 3 pages per chunk)
 * so each OCR request stays under serverless payload (4.5 MB) and timeout (60s) limits.
 * Non-PDF files are returned as a single chunk unchanged.
 */
export async function splitPdfIntoChunks(file: File, pagesPerChunk = 3): Promise<PdfChunk[]> {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return [{ file, startPage: 1, endPage: 1, totalPages: 1 }];
  }

  const [{ PDFDocument }, arrayBuffer] = await Promise.all([
    import("pdf-lib"),
    file.arrayBuffer(),
  ]);
  const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();

  if (totalPages <= pagesPerChunk) {
    return [{ file, startPage: 1, endPage: totalPages, totalPages }];
  }

  const baseName = file.name.replace(/\.pdf$/i, "") || "document";
  const chunks: PdfChunk[] = [];

  for (let startIdx = 0; startIdx < totalPages; startIdx += pagesPerChunk) {
    const endIdx = Math.min(startIdx + pagesPerChunk - 1, totalPages - 1);
    const pageIndices: number[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      pageIndices.push(i);
    }

    const chunkDoc = await PDFDocument.create();
    const copiedPages = await chunkDoc.copyPages(srcDoc, pageIndices);
    for (const page of copiedPages) {
      chunkDoc.addPage(page);
    }

    const chunkBytes = await chunkDoc.save();
    const chunkBlob = new Blob([new Uint8Array(chunkBytes)], { type: "application/pdf" });
    const startPage = startIdx + 1;
    const endPage = endIdx + 1;
    const chunkFile = new File(
      [chunkBlob],
      `${baseName}_p${startPage}-${endPage}.pdf`,
      { type: "application/pdf" }
    );

    chunks.push({ file: chunkFile, startPage, endPage, totalPages });
  }

  return chunks;
}

export interface ParsedApiResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage: string | null;
}

/**
 * Safely parses a fetch Response that may return plain-text/HTML errors (e.g. Vercel 504/413/500)
 * instead of valid JSON.
 */
export async function parseApiJsonResponse<T extends { error?: string }>(
  res: Response
): Promise<ParsedApiResponse<T>> {
  const text = await res.text();
  let data: T | null = null;

  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }

  if (res.ok && data !== null) {
    return { ok: true, status: res.status, data, errorMessage: null };
  }

  if (data?.error) {
    return { ok: false, status: res.status, data, errorMessage: data.error };
  }

  if (res.status === 413) {
    return {
      ok: false,
      status: res.status,
      data: null,
      errorMessage: "Uploaded file chunk exceeds the 4.5 MB server upload limit.",
    };
  }

  if (res.status === 504 || res.status === 502) {
    return {
      ok: false,
      status: res.status,
      data: null,
      errorMessage: `OCR request timed out on the server (HTTP ${res.status}). Please retry.`,
    };
  }

  return {
    ok: false,
    status: res.status,
    data: null,
    errorMessage: `Server returned an unexpected response (HTTP ${res.status}). Please try again.`,
  };
}

