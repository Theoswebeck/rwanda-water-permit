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

  const candidateKeys = Array.from(variants)
    .map(canonicalPermitKey)
    .filter(Boolean);

  return { raw: cleaned, candidateKeys: Array.from(new Set(candidateKeys)) };
}

