/**
 * Coordinate parsing for permit-registry rows.
 *
 * RWB's registry spreadsheet writes a concession boundary as a list of
 * coordinates in the latitude/longitude cells (semicolon- or pipe-separated,
 * or as parallel lists). The XLSX ingest and the staff edit drawer must read
 * that format identically, otherwise a boundary typed by hand would land on
 * the map differently from the same boundary imported from the sheet.
 *
 * Extracted verbatim from the ingest route so both share one implementation.
 */

export function parseCoordinateList(raw: string | undefined): number[] {
  if (!raw) return [];
  const cleaned = raw.replace(/°/g, " ").trim();
  if (!cleaned) return [];
  const matches = cleaned.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map((token) => Number(token)).filter((value) => Number.isFinite(value));
}

export function isLatitudeInRange(value: number): boolean {
  return value >= -90 && value <= 90;
}

export function isLongitudeInRange(value: number): boolean {
  return value >= -180 && value <= 180;
}

function hasSamePoint(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function parseCoordinatePairsFromSingleField(raw: string | undefined): Array<[number, number]> {
  if (!raw) return [];
  const segments = raw.split(/[;|]/).map((s) => s.trim()).filter(Boolean);
  if (segments.length < 3) return [];
  const pairs: Array<[number, number]> = [];
  for (const segment of segments) {
    const nums = parseCoordinateList(segment);
    if (nums.length < 2) return [];
    pairs.push([nums[0], nums[1]]);
  }
  return pairs;
}

/**
 * Closed POLYGON WKT for a concession row, or null when the cells do not hold
 * a usable ring (fewer than 3 points, mismatched lists, out-of-range values).
 * Only concession rows carry a boundary — an authorization is a single point.
 */
export function getConcessionPolygonWkt(
  regime: string | null,
  latitudeRaw: string | undefined,
  longitudeRaw: string | undefined
): string | null {
  if ((regime || "").trim().toLowerCase() !== "concession") return null;

  const latRaw = (latitudeRaw || "").trim();
  const lngRaw = (longitudeRaw || "").trim();
  const latList = parseCoordinateList(latRaw);
  const lngList = parseCoordinateList(lngRaw);

  let latLngPairs: Array<[number, number]> = [];

  if ((latRaw.includes(";") || latRaw.includes("|")) && !lngRaw) {
    latLngPairs = parseCoordinatePairsFromSingleField(latRaw);
  } else if ((lngRaw.includes(";") || lngRaw.includes("|")) && !latRaw) {
    latLngPairs = parseCoordinatePairsFromSingleField(lngRaw);
  } else if (latList.length >= 3 && latList.length === lngList.length) {
    latLngPairs = latList.map((lat, idx) => [lat, lngList[idx]]);
  } else {
    return null;
  }

  if (latLngPairs.length < 3) return null;

  for (const [lat, lng] of latLngPairs) {
    if (!isLatitudeInRange(lat) || !isLongitudeInRange(lng)) return null;
  }

  const ring: Array<[number, number]> = [...latLngPairs];
  if (!hasSamePoint(ring[0], ring[ring.length - 1])) ring.push(ring[0]);

  const wktCoords = ring.map(([lat, lng]) => `${lng} ${lat}`).join(",");
  return `POLYGON((${wktCoords}))`;
}
