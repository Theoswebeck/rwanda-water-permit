const NON_ALNUM_REGEX = /[^A-Z0-9]/g;

function canonicalPermitKey(value: string): string {
  return value.toUpperCase().replace(NON_ALNUM_REGEX, "");
}

function stripLeadingZeros(seq: string): string {
  const normalized = seq.replace(/^0+/, "");
  return normalized.length > 0 ? normalized : "0";
}

function parseSlashPermitNumber(value: string): { seq: string; year: string; hasWpPrefix: boolean } | null {
  const m = value.trim().toUpperCase().match(/^(WP-)?(\d{1,10})\/RWB\/(\d{4})$/);
  if (!m) return null;
  const seq = m[2].padStart(6, "0");
  const year = m[3];
  return { seq, year, hasWpPrefix: Boolean(m[1]) };
}

/**
 * Parses a bulk child permit number: "000918_1/RWB/2026"
 * Returns null for standard (non-child) permit numbers.
 */
export function parseChildPermitNumber(
  value: string
): { parentSeq: string; index: number; year: string } | null {
  const m = value.trim().toUpperCase().match(/^(\d{1,10})_(\d+)\/RWB\/(\d{4})$/);
  if (!m) return null;
  return { parentSeq: m[1].padStart(6, "0"), index: parseInt(m[2], 10), year: m[3] };
}

/**
 * Given a parent permit number ("000918/RWB/2026") and a row index,
 * returns the child permit number "000918_1/RWB/2026".
 */
export function buildChildPermitNumber(parentPermitNumber: string, index: number): string {
  const slash = parseSlashPermitNumber(parentPermitNumber);
  if (slash) {
    return `${slash.seq}_${index}/RWB/${slash.year}`;
  }
  // Generic fallback for non-numeric sequences such as the unassigned placeholder
  // "XXXX/RWB/2026": insert the network index after the sequence segment (before
  // "/RWB/"), producing "XXXX_1/RWB/2026" rather than appending it to the end.
  const m = parentPermitNumber.trim().match(/^(.+?)\/RWB\/(.+)$/i);
  if (m) {
    return `${m[1]}_${index}/RWB/${m[2]}`;
  }
  // Last-resort fallback: append _index directly
  return `${parentPermitNumber}_${index}`;
}

function parseRwbpPermitNumber(value: string): { seq: string; year: string } | null {
  const m = value.trim().toUpperCase().match(/^RWBP-(\d{4})-(\d{1,10})$/);
  if (!m) return null;
  const year = m[1];
  const seq = m[2].padStart(6, "0");
  return { seq, year };
}

export function normalizePermitLookupInput(raw: string): string | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  })();
  if (!decoded) return null;

  const trimmed = decoded.trim();
  if (trimmed.length < 3 || trimmed.length > 128) return null;
  return trimmed;
}

export function buildPermitLookupCandidates(rawPermitNumber: string): { raw: string; candidateKeys: string[] } {
  const cleaned = rawPermitNumber.trim();
  const variants = new Set<string>();
  variants.add(cleaned);

  const slash = parseSlashPermitNumber(cleaned);
  if (slash) {
    const seqUnpadded = stripLeadingZeros(slash.seq);
    const base = `${slash.seq}/RWB/${slash.year}`;
    const baseUnpadded = `${seqUnpadded}/RWB/${slash.year}`;
    variants.add(base);
    variants.add(baseUnpadded);
    variants.add(`WP-${base}`);
    variants.add(`WP-${baseUnpadded}`);
    variants.add(`RWBP-${slash.year}-${slash.seq}`);
    variants.add(`RWBP-${slash.year}-${seqUnpadded}`);
  }

  const rwbp = parseRwbpPermitNumber(cleaned);
  if (rwbp) {
    const seqUnpadded = stripLeadingZeros(rwbp.seq);
    const base = `${rwbp.seq}/RWB/${rwbp.year}`;
    const baseUnpadded = `${seqUnpadded}/RWB/${rwbp.year}`;
    variants.add(base);
    variants.add(baseUnpadded);
    variants.add(`WP-${base}`);
    variants.add(`WP-${baseUnpadded}`);
    variants.add(`RWBP-${rwbp.year}-${rwbp.seq}`);
    variants.add(`RWBP-${rwbp.year}-${seqUnpadded}`);
  }

  if (cleaned.toUpperCase().startsWith("WP-")) {
    variants.add(cleaned.slice(3));
  } else {
    variants.add(`WP-${cleaned}`);
  }

  // Child bulk permit: "000918_1/RWB/2026"
  const child = parseChildPermitNumber(cleaned);
  if (child) {
    const seqNoPad = child.parentSeq.replace(/^0+/, "") || "0";
    variants.add(`${child.parentSeq}_${child.index}/RWB/${child.year}`);
    variants.add(`${seqNoPad}_${child.index}/RWB/${child.year}`);
  }

  const candidateKeys = Array.from(variants)
    .map(canonicalPermitKey)
    .filter(Boolean);

  return { raw: cleaned, candidateKeys: Array.from(new Set(candidateKeys)) };
}

