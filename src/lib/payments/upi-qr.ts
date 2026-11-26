/**
 * Counter Dynamic UPI QR URI builder (NPCI specification).
 */
export interface UpiQrParams {
  vpa: string;
  payeeName: string;
  amountPaise: number;
  txnRef?: string;
  note?: string;
}

export function buildUpiUri(params: UpiQrParams): string {
  const vpa = params.vpa.trim();
  if (!vpa || !vpa.includes("@")) {
    throw new Error("Valid UPI VPA (e.g. store@upi) is required.");
  }
  const pn = encodeURIComponent((params.payeeName || "MediFlow Pharmacy").trim().slice(0, 50));
  const am = (Math.max(0, params.amountPaise) / 100).toFixed(2);
  const query = [`pa=${encodeURIComponent(vpa)}`, `pn=${pn}`, `am=${am}`, "cu=INR"];
  if (params.txnRef?.trim()) {
    query.push(`tr=${encodeURIComponent(params.txnRef.trim().slice(0, 35))}`);
  }
  if (params.note?.trim()) {
    query.push(`tn=${encodeURIComponent(params.note.trim().slice(0, 50))}`);
  }
  return `upi://pay?${query.join("&")}`;
}

/**
 * Generates an inline SVG QR code using a deterministic visual matrix for short UPI strings
 * or standard QR Data URI if rendered in browser. Note: For full ISO-18004 scanning without
 * third-party npm packages, we encode QR Version 4-M (capacity 64 bytes) or Version 6-L (134 bytes)
 * with GF(256) Reed-Solomon error correction.
 */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsComputeEc(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const res = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.copyWithin(0, 1);
    res[ecCount - 1] = 0;
    for (let j = 0; j < ecCount; j++) {
      res[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return res;
}

// Version 5-L: 37x37, 108 data codewords, 26 EC codewords (fits ~106 byte UPI URIs)
// Version 7-L: 45x45, 156 data codewords (2 blocks of 78), 20 EC each (fits ~154 byte UPI URIs)
function encodeQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  // Use Version 6-L: size 41x41, total codewords 172, data 136 (2 blocks of 68), EC 18 per block
  const size = 41;
  const totalData = 136;
  const ecPerBlock = 18;
  const maxBytes = 133;
  const payload = bytes.slice(0, maxBytes);

  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4); // Byte mode
  pushBits(payload.length, 8);
  for (const b of payload) pushBits(b, 8);
  pushBits(0, Math.min(4, totalData * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = new Uint8Array(totalData);
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b];
    codewords[i] = byte;
  }
  const padBytes = [0xec, 0x11];
  for (let i = bits.length / 8, p = 0; i < totalData; i++, p++) {
    codewords[i] = padBytes[p % 2];
  }

  const b1 = codewords.slice(0, 68);
  const b2 = codewords.slice(68, 136);
  const ec1 = rsComputeEc(b1, ecPerBlock);
  const ec2 = rsComputeEc(b2, ecPerBlock);

  const finalBytes: number[] = [];
  for (let i = 0; i < 68; i++) {
    finalBytes.push(b1[i], b2[i]);
  }
  for (let i = 0; i < ecPerBlock; i++) {
    finalBytes.push(ec1[i], ec2[i]);
  }

  const mat: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (r: number, c: number, dark: boolean, isFunc = true) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      mat[r][c] = dark;
      if (isFunc) reserved[r][c] = true;
    }
  };

  const drawFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inBorder = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        const dark = !inBorder && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setModule(r, c, dark);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Alignment pattern for V6 at (34, 34)
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const dark = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
      setModule(34 + dr, 34 + dc, dark);
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // Dark module
  setModule(size - 8, 8, true);

  // Reserve format info
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = size - 8; i < size; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }

  // Place data bits (zigzag)
  const bitStream: number[] = [];
  for (const b of finalBytes) {
    for (let i = 7; i >= 0; i--) bitStream.push((b >> i) & 1);
  }

  let bitIdx = 0;
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const r = up ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (!reserved[r][c]) {
          const bit = bitIdx < bitStream.length ? bitStream[bitIdx++] : 0;
          // Mask pattern 0: (r + c) % 2 === 0
          const masked = bit ^ ((r + c) % 2 === 0 ? 1 : 0);
          mat[r][c] = masked === 1;
        }
      }
    }
    up = !up;
  }

  // Format string for EC Level L (01) + Mask 0 (000) -> BCH = 111011111000100
  const fmtBits = 0b111011111000100;
  for (let i = 0; i < 15; i++) {
    const dark = ((fmtBits >> (14 - i)) & 1) === 1;
    // Around top-left
    if (i < 6) setModule(8, i, dark);
    else if (i < 8) setModule(8, i + 1, dark);
    else setModule(14 - i, 8, dark);
    // Split bottom-left / top-right
    if (i < 7) setModule(size - 1 - i, 8, dark);
    else setModule(8, size - 15 + i, dark);
  }

  return mat.map((row) => row.map((v) => Boolean(v)));
}

export function generateQrSvg(text: string, pxSize = 180): string {
  const matrix = encodeQrMatrix(text);
  const n = matrix.length;
  const quiet = 2;
  const total = n + quiet * 2;
  const paths: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        paths.push(`M${c + quiet},${r + quiet}h1v1h-1z`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${pxSize}" height="${pxSize}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#ffffff"/><path d="${paths.join("")}" fill="#0f172a"/></svg>`;
}
