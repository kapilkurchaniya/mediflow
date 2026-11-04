/**
 * src/lib/qr-code.ts
 *
 * Self-contained, zero-dependency QR Code matrix and SVG generator.
 * Implements ISO/IEC 18004 specification for byte mode encoding.
 * Capable of encoding short URLs up to full NIC E-Invoice signed JWT strings (up to Version 25).
 *
 * Lane B (B5.1)
 */

// Galois Field GF(2^8) math tables for Reed-Solomon error correction
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d; // generator polynomial x^8 + x^4 + x^3 + x^2 + 1
    }
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x]! + LOG_TABLE[y]!];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = EXP_TABLE[i]!;
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j]!, root);
      next[j + 1] ^= poly[j]!;
    }
    poly = next;
  }
  return poly;
}

function calculateReedSolomon(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const remainder = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i]! ^ remainder[0]!;
    remainder.copyWithin(0, 1);
    remainder[ecCount - 1] = 0;
    for (let j = 0; j < ecCount; j++) {
      remainder[j] ^= gfMul(gen[j]!, factor);
    }
  }
  return remainder;
}

// Error Correction Level Low (L) - suitable for max data density
interface VersionConfig {
  version: number;
  totalCodewords: number;
  ecPerBlock: number;
  blocks: { count: number; dataCodewords: number }[];
  alignmentPositions: number[];
}

const VERSION_CONFIGS: VersionConfig[] = [
  { version: 1, totalCodewords: 26, ecPerBlock: 7, blocks: [{ count: 1, dataCodewords: 19 }], alignmentPositions: [] },
  { version: 2, totalCodewords: 44, ecPerBlock: 10, blocks: [{ count: 1, dataCodewords: 34 }], alignmentPositions: [6, 18] },
  { version: 3, totalCodewords: 70, ecPerBlock: 15, blocks: [{ count: 1, dataCodewords: 55 }], alignmentPositions: [6, 22] },
  { version: 4, totalCodewords: 100, ecPerBlock: 20, blocks: [{ count: 1, dataCodewords: 80 }], alignmentPositions: [6, 26] },
  { version: 5, totalCodewords: 134, ecPerBlock: 26, blocks: [{ count: 1, dataCodewords: 108 }], alignmentPositions: [6, 30] },
  { version: 6, totalCodewords: 172, ecPerBlock: 18, blocks: [{ count: 2, dataCodewords: 68 }], alignmentPositions: [6, 34] },
  { version: 7, totalCodewords: 196, ecPerBlock: 20, blocks: [{ count: 2, dataCodewords: 78 }], alignmentPositions: [6, 22, 38] },
  { version: 8, totalCodewords: 242, ecPerBlock: 24, blocks: [{ count: 2, dataCodewords: 97 }], alignmentPositions: [6, 24, 42] },
  { version: 9, totalCodewords: 292, ecPerBlock: 30, blocks: [{ count: 2, dataCodewords: 116 }], alignmentPositions: [6, 26, 46] },
  { version: 10, totalCodewords: 346, ecPerBlock: 18, blocks: [{ count: 2, dataCodewords: 68 }, { count: 2, dataCodewords: 69 }], alignmentPositions: [6, 28, 50] },
  { version: 11, totalCodewords: 404, ecPerBlock: 20, blocks: [{ count: 4, dataCodewords: 81 }], alignmentPositions: [6, 30, 54] },
  { version: 12, totalCodewords: 466, ecPerBlock: 24, blocks: [{ count: 2, dataCodewords: 92 }, { count: 2, dataCodewords: 93 }], alignmentPositions: [6, 32, 58] },
  { version: 13, totalCodewords: 532, ecPerBlock: 26, blocks: [{ count: 4, dataCodewords: 107 }], alignmentPositions: [6, 34, 62] },
  { version: 14, totalCodewords: 581, ecPerBlock: 30, blocks: [{ count: 3, dataCodewords: 115 }, { count: 1, dataCodewords: 116 }], alignmentPositions: [6, 26, 46, 66] },
  { version: 15, totalCodewords: 655, ecPerBlock: 22, blocks: [{ count: 5, dataCodewords: 87 }, { count: 1, dataCodewords: 88 }], alignmentPositions: [6, 26, 48, 70] },
  { version: 16, totalCodewords: 733, ecPerBlock: 24, blocks: [{ count: 5, dataCodewords: 98 }, { count: 1, dataCodewords: 99 }], alignmentPositions: [6, 26, 50, 74] },
  { version: 17, totalCodewords: 815, ecPerBlock: 28, blocks: [{ count: 1, dataCodewords: 107 }, { count: 5, dataCodewords: 108 }], alignmentPositions: [6, 30, 54, 78] },
  { version: 18, totalCodewords: 901, ecPerBlock: 30, blocks: [{ count: 5, dataCodewords: 120 }, { count: 1, dataCodewords: 121 }], alignmentPositions: [6, 30, 56, 82] },
  { version: 19, totalCodewords: 991, ecPerBlock: 28, blocks: [{ count: 3, dataCodewords: 113 }, { count: 4, dataCodewords: 114 }], alignmentPositions: [6, 30, 58, 86] },
  { version: 20, totalCodewords: 1085, ecPerBlock: 28, blocks: [{ count: 3, dataCodewords: 107 }, { count: 5, dataCodewords: 108 }], alignmentPositions: [6, 34, 62, 90] },
  { version: 21, totalCodewords: 1156, ecPerBlock: 28, blocks: [{ count: 4, dataCodewords: 116 }, { count: 4, dataCodewords: 117 }], alignmentPositions: [6, 28, 50, 72, 94] },
  { version: 22, totalCodewords: 1258, ecPerBlock: 28, blocks: [{ count: 2, dataCodewords: 111 }, { count: 7, dataCodewords: 112 }], alignmentPositions: [6, 26, 50, 74, 98] },
  { version: 23, totalCodewords: 1364, ecPerBlock: 30, blocks: [{ count: 4, dataCodewords: 121 }, { count: 5, dataCodewords: 122 }], alignmentPositions: [6, 30, 54, 78, 102] },
  { version: 24, totalCodewords: 1474, ecPerBlock: 30, blocks: [{ count: 6, dataCodewords: 117 }, { count: 4, dataCodewords: 118 }], alignmentPositions: [6, 28, 54, 80, 106] },
  { version: 25, totalCodewords: 1588, ecPerBlock: 26, blocks: [{ count: 8, dataCodewords: 106 }, { count: 4, dataCodewords: 107 }], alignmentPositions: [6, 32, 58, 84, 110] },
];

function selectVersion(dataLen: number): VersionConfig {
  for (const cfg of VERSION_CONFIGS) {
    const totalDataCapacity = cfg.blocks.reduce(
      (sum, b) => sum + b.count * b.dataCodewords,
      0
    );
    const countBits = cfg.version >= 10 ? 16 : 8;
    const requiredBytes = Math.ceil((4 + countBits + dataLen * 8) / 8);
    if (requiredBytes <= totalDataCapacity) {
      return cfg;
    }
  }
  return VERSION_CONFIGS[VERSION_CONFIGS.length - 1]!;
}

class BitBuffer {
  buffer: number[] = [];
  length = 0;

  put(num: number, length: number) {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }

  putBit(bit: boolean) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[bufIndex]! |= 0x80 >>> (this.length % 8);
    }
    this.length++;
  }

  getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

export function generateQrMatrix(text: string): boolean[][] {
  const utf8Encoder = new TextEncoder();
  const rawBytes = utf8Encoder.encode(text);
  const cfg = selectVersion(rawBytes.length);
  const size = cfg.version * 4 + 17;

  const totalDataCapacity = cfg.blocks.reduce((sum, b) => sum + b.count * b.dataCodewords, 0);

  // 1. Bit Stream Packing
  const bb = new BitBuffer();
  bb.put(0x4, 4); // Byte Mode
  const countBits = cfg.version >= 10 ? 16 : 8;
  bb.put(rawBytes.length, countBits);
  for (let i = 0; i < rawBytes.length; i++) {
    bb.put(rawBytes[i]!, 8);
  }

  // Terminator (up to 4 zeros)
  const padBits = Math.min(4, totalDataCapacity * 8 - bb.length);
  bb.put(0, padBits);

  // Padding to byte boundary
  while (bb.length % 8 !== 0) {
    bb.putBit(false);
  }

  // Pad bytes 0xEC, 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bb.length < totalDataCapacity * 8) {
    bb.put(padBytes[padIdx % 2]!, 8);
    padIdx++;
  }

  const packedData = bb.getBytes();

  // 2. Block division & Error Correction
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let byteOffset = 0;

  for (const blockGroup of cfg.blocks) {
    for (let b = 0; b < blockGroup.count; b++) {
      const dLen = blockGroup.dataCodewords;
      const dBlock = packedData.slice(byteOffset, byteOffset + dLen);
      byteOffset += dLen;
      const ecBlock = calculateReedSolomon(dBlock, cfg.ecPerBlock);
      dataBlocks.push(dBlock);
      ecBlocks.push(ecBlock);
    }
  }

  // 3. Interleaving
  const interleaved: number[] = [];
  let maxDataLen = 0;
  for (const b of dataBlocks) maxDataLen = Math.max(maxDataLen, b.length);

  for (let i = 0; i < maxDataLen; i++) {
    for (const b of dataBlocks) {
      if (i < b.length) interleaved.push(b[i]!);
    }
  }
  for (let i = 0; i < cfg.ecPerBlock; i++) {
    for (const ec of ecBlocks) {
      if (i < ec.length) interleaved.push(ec[i]!);
    }
  }

  // 4. Matrix Population
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null)
  );

  function setFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const mr = row + r;
        const mc = col + c;
        if (mr >= 0 && mr < size && mc >= 0 && mc < size) {
          if (
            (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
            (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          ) {
            matrix[mr]![mc] = true;
          } else {
            matrix[mr]![mc] = false;
          }
        }
      }
    }
  }

  setFinder(0, 0);
  setFinder(0, size - 7);
  setFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6]![i] === null) matrix[6]![i] = i % 2 === 0;
    if (matrix[i]![6] === null) matrix[i]![6] = i % 2 === 0;
  }

  // Alignment patterns
  const pos = cfg.alignmentPositions;
  for (let r = 0; r < pos.length; r++) {
    for (let c = 0; c < pos.length; c++) {
      const ar = pos[r]!;
      const ac = pos[c]!;
      if (
        (ar <= 8 && ac <= 8) ||
        (ar <= 8 && ac >= size - 8) ||
        (ar >= size - 8 && ac <= 8)
      ) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (
            Math.abs(dr) === 2 ||
            Math.abs(dc) === 2 ||
            (dr === 0 && dc === 0)
          ) {
            matrix[ar + dr]![ac + dc] = true;
          } else {
            matrix[ar + dr]![ac + dc] = false;
          }
        }
      }
    }
  }

  // Dark module
  matrix[cfg.version * 4 + 9]![8] = true;

  // Format info area reservation
  for (let i = 0; i < 9; i++) {
    if (matrix[8]![i] === null) matrix[8]![i] = false;
    if (matrix[i]![8] === null) matrix[i]![8] = false;
  }
  for (let i = 0; i < 8; i++) {
    if (matrix[8]![size - 1 - i] === null) matrix[8]![size - 1 - i] = false;
    if (matrix[size - 1 - i]![8] === null) matrix[size - 1 - i]![8] = false;
  }

  // 5. Place Interleaved Data Bits
  let bitIdx = 0;
  const totalBits = interleaved.length * 8;
  let upward = true;

  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (let col = right; col >= right - 1; col--) {
        if (matrix[row]![col] === null) {
          let bit = false;
          if (bitIdx < totalBits) {
            const byte = interleaved[Math.floor(bitIdx / 8)]!;
            bit = ((byte >>> (7 - (bitIdx % 8))) & 1) === 1;
            bitIdx++;
          }
          const mask = (row + col) % 2 === 0;
          matrix[row]![col] = bit !== mask;
        }
      }
    }
    upward = !upward;
  }

  // 6. Format Information (Level L, Mask 0: 0x77C4 ^ 0x5465 = 0x23A1)
  const formatBits = 0x77c4 ^ 0x5465;
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >>> (14 - i)) & 1) === 1;
    if (i <= 5) matrix[8]![i] = bit;
    else if (i === 6) matrix[8]![7] = bit;
    else if (i === 7) matrix[8]![8] = bit;
    else if (i === 8) matrix[7]![8] = bit;
    else matrix[14 - i]![8] = bit;

    if (i < 8) matrix[size - 1 - i]![8] = bit;
    else matrix[8]![size - 15 + i] = bit;
  }

  return matrix.map((row) => row.map((cell) => cell ?? false));
}

/**
 * Generates an SVG path string or full SVG element for a QR code.
 */
export function generateQrSvg(
  text: string,
  options?: {
    size?: number;
    margin?: number;
    color?: string;
    bgColor?: string;
  }
): string {
  const matrix = generateQrMatrix(text);
  const matrixSize = matrix.length;
  const margin = options?.margin ?? 2;
  const totalDim = matrixSize + margin * 2;
  const size = options?.size ?? 200;
  const color = options?.color ?? "#000000";
  const bgColor = options?.bgColor ?? "#ffffff";

  let pathD = "";
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r]![c]) {
        pathD += `M${c + margin},${r + margin}h1v1h-1z `;
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDim} ${totalDim}" ` +
    `width="${size}" height="${size}" shape-rendering="crispEdges">` +
    `<rect width="${totalDim}" height="${totalDim}" fill="${bgColor}"/>` +
    `<path d="${pathD.trim()}" fill="${color}"/>` +
    `</svg>`
  );
}
