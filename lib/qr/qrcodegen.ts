/**
 * QR Code generator library (TypeScript port).
 *
 * This is a vendored, dependency-free implementation based on Nayuki's QR Code generator.
 * Kept local to avoid adding new npm deps for QR generation.
 *
 * Original work: https://www.nayuki.io/page/qr-code-generator-library
 * License: MIT
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

export enum QrCodeEcc {
  LOW = 0,
  MEDIUM = 1,
  QUARTILE = 2,
  HIGH = 3,
}

export class QrCode {
  public readonly version: number;
  public readonly size: number;
  public readonly errorCorrectionLevel: QrCodeEcc;
  public readonly mask: number;
  private readonly modules: boolean[][];
  private readonly isFunction: boolean[][];

  private constructor(
    version: number,
    errorCorrectionLevel: QrCodeEcc,
    dataCodewords: Uint8Array,
    mask: number
  ) {
    this.version = version;
    this.size = version * 4 + 17;
    this.errorCorrectionLevel = errorCorrectionLevel;
    this.mask = mask;
    this.modules = Array.from({ length: this.size }, () => Array(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => Array(this.size).fill(false));

    // Draw function patterns, then draw codewords, then apply mask, then draw format/version bits.
    this.drawFunctionPatterns();
    const allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);
    this.applyMask(mask);
    this.drawFormatBits(mask);
    this.drawVersion();
  }

  public static encodeText(text: string, ecl: QrCodeEcc): QrCode {
    const segs = QrSegment.makeSegments(text);
    return QrCode.encodeSegments(segs, ecl);
  }

  public static encodeSegments(
    segs: ReadonlyArray<QrSegment>,
    ecl: QrCodeEcc,
    minVersion = 1,
    maxVersion = 40,
    mask = -1,
    boostEcl = true
  ): QrCode {
    if (!(1 <= minVersion && minVersion <= maxVersion && maxVersion <= 40) || mask < -1 || mask > 7) {
      throw new RangeError("Invalid value");
    }

    let version: number;
    let dataUsedBits = 0;
    for (version = minVersion; ; version++) {
      const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
      dataUsedBits = QrSegment.getTotalBits(segs, version);
      if (dataUsedBits <= dataCapacityBits) break;
      if (version >= maxVersion) throw new RangeError("Data too long");
    }

    // Optionally boost ECC if it still fits.
    if (boostEcl) {
      for (const newEcl of [QrCodeEcc.MEDIUM, QrCodeEcc.QUARTILE, QrCodeEcc.HIGH] as const) {
        if (newEcl > ecl) {
          const cap = QrCode.getNumDataCodewords(version, newEcl) * 8;
          if (dataUsedBits <= cap) ecl = newEcl;
        }
      }
    }

    // Create data bit buffer
    const bb = new BitBuffer();
    for (const seg of segs) {
      bb.appendBits(seg.mode.modeBits, 4);
      bb.appendBits(seg.numChars, seg.mode.numCharCountBits(version));
      bb.appendData(seg.data);
    }

    // Terminator and padding
    const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
    bb.appendBits(0, Math.min(4, dataCapacityBits - bb.length));
    bb.appendBits(0, (8 - (bb.length % 8)) % 8);
    for (let padByte = 0xec; bb.length < dataCapacityBits; padByte ^= 0xec ^ 0x11) {
      bb.appendBits(padByte, 8);
    }

    const dataCodewords = new Uint8Array(bb.length / 8);
    for (let i = 0; i < dataCodewords.length; i++) {
      dataCodewords[i] = bb.getByte(i);
    }

    // Choose mask
    let bestMask = 0;
    let minPenalty = Number.POSITIVE_INFINITY;
    if (mask === -1) {
      for (let m = 0; m < 8; m++) {
        const qr = new QrCode(version, ecl, dataCodewords, m);
        const penalty = qr.getPenaltyScore();
        if (penalty < minPenalty) {
          minPenalty = penalty;
          bestMask = m;
        }
      }
    } else {
      bestMask = mask;
    }

    return new QrCode(version, ecl, dataCodewords, bestMask);
  }

  public getModule(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false;
    return this.modules[y]![x]!;
  }

  // ---- Drawing & construction ----

  private drawFunctionPatterns(): void {
    // Finder patterns and separators
    for (const [x, y] of [
      [3, 3],
      [this.size - 4, 3],
      [3, this.size - 4],
    ] as const) {
      this.drawFinderPattern(x, y);
    }

    // Timing patterns
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }

    // Alignment patterns
    const alignPatPos = QrCode.getAlignmentPatternPositions(this.version);
    const numAlign = alignPatPos.length;
    for (let i = 0; i < numAlign; i++) {
      for (let j = 0; j < numAlign; j++) {
        if (
          (i === 0 && j === 0) ||
          (i === 0 && j === numAlign - 1) ||
          (i === numAlign - 1 && j === 0)
        ) {
          continue;
        }
        this.drawAlignmentPattern(alignPatPos[i]!, alignPatPos[j]!);
      }
    }

    // Dark module
    this.setFunctionModule(8, this.size - 8, true);

    // Reserve format info
    for (let i = 0; i < 9; i++) {
      if (i !== 6) {
        this.setFunctionModule(8, i, false);
        this.setFunctionModule(i, 8, false);
      }
    }
    for (let i = 0; i < 8; i++) {
      this.setFunctionModule(this.size - 1 - i, 8, false);
      this.setFunctionModule(8, this.size - 1 - i, false);
    }
    this.setFunctionModule(8, this.size - 8, true);

    // Reserve version info
    if (this.version >= 7) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          this.setFunctionModule(this.size - 11 + j, i, false);
          this.setFunctionModule(i, this.size - 11 + j, false);
        }
      }
    }
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (0 <= xx && xx < this.size && 0 <= yy && yy < this.size) {
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  private setFunctionModule(x: number, y: number, isDark: boolean): void {
    this.modules[y]![x] = isDark;
    this.isFunction[y]![x] = true;
  }

  private addEccAndInterleave(data: Uint8Array): Uint8Array {
    const ver = this.version;
    const ecl = this.errorCorrectionLevel;
    const numBlocks = QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl]![ver]!;
    const blockEccLen = QrCode.ECC_CODEWORDS_PER_BLOCK[ecl]![ver]!;
    const rawCodewords = QrCode.getNumRawDataModules(ver) / 8;
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks: Uint8Array[] = [];
    const rsDiv = ReedSolomonGenerator.getInstance(blockEccLen);
    let k = 0;
    for (let i = 0; i < numBlocks; i++) {
      const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      const dat = data.slice(k, k + datLen);
      k += datLen;
      const ecc = rsDiv.getRemainder(dat);
      const block = new Uint8Array(dat.length + ecc.length);
      block.set(dat, 0);
      block.set(ecc, dat.length);
      blocks.push(block);
    }

    const result = new Uint8Array(rawCodewords);
    let idx = 0;
    for (let i = 0; i < blocks[0]!.length; i++) {
      for (let j = 0; j < blocks.length; j++) {
        // Skip padding byte in short blocks
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
          const b = blocks[j]!;
          if (i < b.length) result[idx++] = b[i]!;
        }
      }
    }
    return result;
  }

  private drawCodewords(data: Uint8Array): void {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const y = ((right + 1) & 2) === 0 ? this.size - 1 - vert : vert;
          if (!this.isFunction[y]![x] && i < data.length * 8) {
            this.modules[y]![x] = ((data[i >>> 3]! >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  private applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.isFunction[y]![x]) continue;
        let invert = false;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0;
            break;
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          case 7:
            invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          default:
            throw new RangeError("Mask out of range");
        }
        if (invert) this.modules[y]![x] = !this.modules[y]![x];
      }
    }
  }

  private drawFormatBits(mask: number): void {
    const data = (QrCode.getFormatBits(this.errorCorrectionLevel) << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, ((bits >>> i) & 1) !== 0);
    this.setFunctionModule(8, 7, ((bits >>> 6) & 1) !== 0);
    this.setFunctionModule(8, 8, ((bits >>> 7) & 1) !== 0);
    this.setFunctionModule(7, 8, ((bits >>> 8) & 1) !== 0);
    for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, ((bits >>> i) & 1) !== 0);

    for (let i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, ((bits >>> i) & 1) !== 0);
    for (let i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, ((bits >>> i) & 1) !== 0);
    this.setFunctionModule(8, this.size - 8, true);
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ (((rem >>> 11) & 1) * 0x1f25);
    const bits = (this.version << 12) | rem;

    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, bit);
      this.setFunctionModule(b, a, bit);
    }
  }

  // ---- Penalty score ----

  private getPenaltyScore(): number {
    let result = 0;
    const size = this.size;

    // Adjacent modules in row/column in same color
    for (let y = 0; y < size; y++) {
      let runColor = false;
      let runLen = 0;
      for (let x = 0; x < size; x++) {
        const color = this.modules[y]![x]!;
        if (x === 0 || color !== runColor) {
          runColor = color;
          runLen = 1;
        } else {
          runLen++;
          if (runLen === 5) result += 3;
          else if (runLen > 5) result++;
        }
      }
    }
    for (let x = 0; x < size; x++) {
      let runColor = false;
      let runLen = 0;
      for (let y = 0; y < size; y++) {
        const color = this.modules[y]![x]!;
        if (y === 0 || color !== runColor) {
          runColor = color;
          runLen = 1;
        } else {
          runLen++;
          if (runLen === 5) result += 3;
          else if (runLen > 5) result++;
        }
      }
    }

    // 2x2 blocks
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = this.modules[y]![x]!;
        if (
          c === this.modules[y]![x + 1]! &&
          c === this.modules[y + 1]![x]! &&
          c === this.modules[y + 1]![x + 1]!
        ) {
          result += 3;
        }
      }
    }

    // Finder-like patterns
    const finder = [true, false, true, true, true, false, true];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size - 6; x++) {
        let match = true;
        for (let k = 0; k < 7; k++) match &&= this.modules[y]![x + k]! === finder[k]!;
        if (match && (this.isWhiteHorizontal(y, x - 4, x) || this.isWhiteHorizontal(y, x + 7, x + 11))) {
          result += 40;
        }
      }
    }
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size - 6; y++) {
        let match = true;
        for (let k = 0; k < 7; k++) match &&= this.modules[y + k]![x]! === finder[k]!;
        if (match && (this.isWhiteVertical(x, y - 4, y) || this.isWhiteVertical(x, y + 7, y + 11))) {
          result += 40;
        }
      }
    }

    // Balance of dark modules
    let dark = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (this.modules[y]![x]!) dark++;
    const total = size * size;
    const k = Math.abs(dark * 20 - total * 10) / total;
    result += Math.floor(k) * 10;

    return result;
  }

  private isWhiteHorizontal(y: number, xStart: number, xEnd: number): boolean {
    const size = this.size;
    for (let x = xStart; x < xEnd; x++) {
      if (0 <= x && x < size && this.modules[y]![x]!) return false;
    }
    return true;
  }

  private isWhiteVertical(x: number, yStart: number, yEnd: number): boolean {
    const size = this.size;
    for (let y = yStart; y < yEnd; y++) {
      if (0 <= y && y < size && this.modules[y]![x]!) return false;
    }
    return true;
  }

  // ---- Static tables/helpers ----

  private static getNumRawDataModules(ver: number): number {
    if (ver < 1 || ver > 40) throw new RangeError("Version out of range");
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  private static getNumDataCodewords(ver: number, ecl: QrCodeEcc): number {
    return QrCode.getNumRawDataModules(ver) / 8 - QrCode.ECC_CODEWORDS_PER_BLOCK[ecl]![ver]! * QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl]![ver]!;
  }

  private static getAlignmentPatternPositions(ver: number): number[] {
    if (ver === 1) return [];
    const numAlign = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const res: number[] = [];
    for (let i = 0; i < numAlign - 1; i++) res.push(6 + i * step);
    res.push(ver * 4 + 10);
    return res;
  }

  private static getFormatBits(ecl: QrCodeEcc): number {
    switch (ecl) {
      case QrCodeEcc.LOW:
        return 1;
      case QrCodeEcc.MEDIUM:
        return 0;
      case QrCodeEcc.QUARTILE:
        return 3;
      case QrCodeEcc.HIGH:
        return 2;
      default:
        throw new RangeError("ECL out of range");
    }
  }

  private static readonly ECC_CODEWORDS_PER_BLOCK: ReadonlyArray<ReadonlyArray<number>> = [
    [
      -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30,
      30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    ],
    [
      -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
    ],
    [
      -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30,
      30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    ],
    [
      -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30,
      30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    ],
  ];

  private static readonly NUM_ERROR_CORRECTION_BLOCKS: ReadonlyArray<ReadonlyArray<number>> = [
    [
      -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14,
      15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
    ],
    [
      -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25,
      26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
    ],
    [
      -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34,
      34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
    ],
    [
      -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37,
      40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
    ],
  ];
}

export enum QrSegmentMode {
  NUMERIC = 0x1,
  ALPHANUMERIC = 0x2,
  BYTE = 0x4,
  KANJI = 0x8,
  ECI = 0x7,
}

export class QrSegment {
  public readonly mode: QrSegment.Mode;
  public readonly numChars: number;
  public readonly data: ReadonlyArray<number>;

  public constructor(mode: QrSegment.Mode, numChars: number, data: ReadonlyArray<number>) {
    this.mode = mode;
    this.numChars = numChars;
    this.data = data;
  }

  public static makeSegments(text: string): QrSegment[] {
    // Simple segmentation: encode as byte mode UTF-8
    return [QrSegment.makeBytes(QrSegment.utf8ToBytes(text))];
  }

  public static makeBytes(data: Uint8Array): QrSegment {
    const bb = new BitBuffer();
    for (const b of data) bb.appendBits(b, 8);
    return new QrSegment(QrSegment.Mode.BYTE, data.length, bb.data);
  }

  public static getTotalBits(segs: ReadonlyArray<QrSegment>, version: number): number {
    let result = 0;
    for (const seg of segs) {
      const ccbits = seg.mode.numCharCountBits(version);
      if (seg.numChars >= 1 << ccbits) return Number.POSITIVE_INFINITY;
      result += 4 + ccbits + seg.data.length;
    }
    return result;
  }

  private static utf8ToBytes(str: string): Uint8Array {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    // Fallback: basic UTF-8 encoding for Node/older envs
    const utf8: number[] = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) utf8.push(c);
      else if (c < 0x800) {
        utf8.push(0xc0 | (c >>> 6));
        utf8.push(0x80 | (c & 0x3f));
      } else if (c < 0xd800 || c >= 0xe000) {
        utf8.push(0xe0 | (c >>> 12));
        utf8.push(0x80 | ((c >>> 6) & 0x3f));
        utf8.push(0x80 | (c & 0x3f));
      } else {
        // Surrogate pair
        i++;
        c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
        utf8.push(0xf0 | (c >>> 18));
        utf8.push(0x80 | ((c >>> 12) & 0x3f));
        utf8.push(0x80 | ((c >>> 6) & 0x3f));
        utf8.push(0x80 | (c & 0x3f));
      }
    }
    return new Uint8Array(utf8);
  }
}

export namespace QrSegment {
  export class Mode {
    public readonly modeBits: number;
    private readonly numBitsCharCount: [number, number, number];

    private constructor(modeBits: number, ccbits: [number, number, number]) {
      this.modeBits = modeBits;
      this.numBitsCharCount = ccbits;
    }

    public numCharCountBits(ver: number): number {
      if (ver < 1 || ver > 40) throw new RangeError("Version out of range");
      return this.numBitsCharCount[ver < 10 ? 0 : ver < 27 ? 1 : 2];
    }

    public static readonly BYTE = new Mode(QrSegmentMode.BYTE, [8, 16, 16]);
  }
}

class BitBuffer {
  public data: number[] = [];
  public length = 0;

  public appendBits(val: number, len: number): void {
    if (len < 0 || len > 31 || (val >>> len) !== 0) throw new RangeError("Value out of range");
    for (let i = len - 1; i >= 0; i--) this.appendBit(((val >>> i) & 1) !== 0);
  }

  public appendData(bits: ReadonlyArray<number>): void {
    for (const b of bits) this.appendBit(b !== 0);
  }

  private appendBit(bit: boolean): void {
    const i = this.length;
    if (i === this.data.length) this.data.push(0);
    if (bit) this.data[i] = 1;
    this.length++;
  }

  public getByte(index: number): number {
    let result = 0;
    for (let i = 0; i < 8; i++) {
      result = (result << 1) | (this.data[index * 8 + i]! & 1);
    }
    return result;
  }
}

class ReedSolomonGenerator {
  private static cache = new Map<number, ReedSolomonGenerator>();
  private readonly coefficients: Uint8Array;

  public static getInstance(degree: number): ReedSolomonGenerator {
    const cached = ReedSolomonGenerator.cache.get(degree);
    if (cached) return cached;
    const gen = new ReedSolomonGenerator(degree);
    ReedSolomonGenerator.cache.set(degree, gen);
    return gen;
  }

  private constructor(degree: number) {
    if (degree < 1 || degree > 255) throw new RangeError("Degree out of range");
    const coeffs = new Uint8Array(degree);
    coeffs[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        coeffs[j] = ReedSolomonGenerator.multiply(coeffs[j]!, root);
        if (j + 1 < degree) coeffs[j] ^= coeffs[j + 1]!;
      }
      root = ReedSolomonGenerator.multiply(root, 0x02);
    }
    this.coefficients = coeffs;
  }

  public getRemainder(data: Uint8Array): Uint8Array {
    const result = new Uint8Array(this.coefficients.length);
    for (const b of data) {
      const factor = b ^ result[0]!;
      result.copyWithin(0, 1);
      result[result.length - 1] = 0;
      for (let i = 0; i < result.length; i++) {
        result[i] ^= ReedSolomonGenerator.multiply(this.coefficients[i]!, factor);
      }
    }
    return result;
  }

  private static multiply(x: number, y: number): number {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ (((z >>> 7) & 1) * 0x11d);
      if (((y >>> i) & 1) !== 0) z ^= x;
    }
    return z & 0xff;
  }
}




