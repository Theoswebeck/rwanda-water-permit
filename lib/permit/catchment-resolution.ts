/**
 * Resolves a Permit Registry row to a Level-I catchment and a district.
 *
 * The registry carries neither field: its source XLSX has 16 columns and none
 * of them is a catchment, while the place of use is a single free-text
 * `location` string ("Western Province, Nyamasheke District, Karengera Sector,
 * Miko Cell"). The public Water Use Dashboard needs "Permits per District" and
 * "Permits per Catchment", so both are derived here.
 *
 * Catchment cascade, most precise first:
 *   1. coordinates → point-in-polygon against the nine official RWB Level-I
 *      catchments (covers ~63% of the registry, which is where coordinates
 *      exist and are inside Rwanda);
 *   2. sector → catchment, from the precomputed maximum-area overlap table;
 *   3. district → catchment, same method but coarser — districts can straddle
 *      catchments, so this is an estimate and the dashboard says so;
 *   4. otherwise unresolved.
 *
 * District cascade: exact name match → conservative fuzzy match (accepted only
 * when exactly one district is within edit distance 2) → sector name lookup
 * (accepted only when that sector name belongs to exactly one district).
 *
 * The lookup tables under `data/` are built offline by
 * `scripts/build-catchment-lookup.mjs`. Nothing here touches the network.
 */

import boundaries from "./data/catchment-boundaries.json";
import adminLookup from "./data/catchment-admin-lookup.json";
import rwandaData from "../rwanda-data.json";
import { RWANDA_CATCHMENTS } from "../rwanda-catchments";

type Ring = number[][];
type PolygonCoords = Ring[];

interface CatchmentFeature {
  properties: { code: string };
  geometry: { type: string; coordinates: unknown };
}

interface PreparedPolygon {
  code: string;
  rings: PolygonCoords;
  bbox: [number, number, number, number]; // minLng, minLat, maxLng, maxLat
}

/** Rwanda's bounding box, with a small margin. Rejects obviously bad coordinates. */
const RWANDA_BBOX = { minLat: -2.95, maxLat: -1.02, minLng: 28.83, maxLng: 30.95 };

export type CatchmentSource = "coordinates" | "sector" | "district" | "unresolved";

export interface CatchmentResolution {
  /** Level-I hydrological code, e.g. "CKIV". Null when unresolved. */
  code: string | null;
  /** Display label, e.g. "Lake Kivu (CKIV)". Null when unresolved. */
  label: string | null;
  source: CatchmentSource;
}

export interface DistrictResolution {
  district: string | null;
  sector: string | null;
}

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

function normalizeName(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

// ---------------------------------------------------------------------------
// Administrative index (built once, lazily)
// ---------------------------------------------------------------------------

interface AdminIndex {
  districts: string[];
  /** normalized district name → canonical district name */
  districtByNormalized: Map<string, string>;
  /** normalized sector name → set of districts containing it */
  districtsBySector: Map<string, Set<string>>;
}

let adminIndexCache: AdminIndex | null = null;

function getAdminIndex(): AdminIndex {
  if (adminIndexCache) return adminIndexCache;

  const districts: string[] = [];
  const districtByNormalized = new Map<string, string>();
  const districtsBySector = new Map<string, Set<string>>();

  const data = rwandaData as unknown as Record<
    string,
    Record<string, Record<string, unknown>>
  >;

  for (const province of Object.keys(data)) {
    for (const district of Object.keys(data[province])) {
      districts.push(district);
      districtByNormalized.set(normalizeName(district), district);
      for (const sector of Object.keys(data[province][district])) {
        const key = normalizeName(sector);
        if (!districtsBySector.has(key)) districtsBySector.set(key, new Set());
        districtsBySector.get(key)!.add(district);
      }
    }
  }

  adminIndexCache = { districts, districtByNormalized, districtsBySector };
  return adminIndexCache;
}

export function getAllDistricts(): string[] {
  return [...getAdminIndex().districts].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// District / sector resolution from free-text location
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length;
  const n = b.length;
  let previous = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const current = [i];
    for (let j = 1; j <= n; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[n];
}

/**
 * Extract district and sector from a free-text location.
 *
 * Deliberately conservative: a fuzzy or sector-derived district is only
 * accepted when it is unambiguous, because a wrong district silently corrupts
 * both the district tab and the catchment fallback.
 */
export function resolveDistrictFromLocation(
  location: string | null | undefined
): DistrictResolution {
  const index = getAdminIndex();
  const raw = String(location ?? "");
  if (!raw.trim()) return { district: null, sector: null };

  const lower = raw.toLowerCase();
  const tokens = lower.split(/[^a-z]+/).filter(Boolean);

  // --- sector (used both as an answer and as a district fallback) ----------
  // Only a token explicitly labelled "… Sector" counts. Sector, district,
  // cell and village names overlap heavily in Rwanda: 21 sectors share their
  // district's name (Kicukiro Sector in Kicukiro District, Huye Sector in Huye
  // District, …), and "Kigali" is both a province and a Nyarugenge sector.
  // Without the label, "Kicukiro District" would be read as a sector and take
  // the sector branch below, bypassing the district confidence threshold.
  let sector: string | null = null;
  let sectorDistricts: Set<string> | null = null;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i + 1] !== "sector") continue;
    const candidates = index.districtsBySector.get(tokens[i]);
    if (!candidates) continue;
    sector = tokens[i];
    sectorDistricts = candidates;
    break;
  }

  // --- 1. exact district name ---------------------------------------------
  // When several appear, prefer the one immediately followed by "district".
  // A token labelled as a smaller unit is never the district: "Ngoma Sector,
  // Huye" names the Huye district, not the Ngoma one.
  const SMALLER_UNITS = new Set(["sector", "cell", "village"]);
  let exact: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const canonical = index.districtByNormalized.get(tokens[i]);
    if (!canonical) continue;
    if (SMALLER_UNITS.has(tokens[i + 1] ?? "")) continue;
    if (tokens[i + 1] === "district") {
      exact = canonical;
      break;
    }
    if (!exact) exact = canonical;
  }
  if (exact) {
    return { district: exact, sector: sectorNameFor(sector, exact) };
  }

  // --- 2. conservative fuzzy match ----------------------------------------
  // Only tokens explicitly labelled "… District" are considered. Village and
  // cell names are close enough to district names to collide otherwise — the
  // cell "Gisayura" is two edits from the district "Gisagara", and matching it
  // would silently file a Karongi permit under Gisagara.
  const fuzzyMatches = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.length < 6) continue;
    if (tokens[i + 1] !== "district") continue;
    for (const district of index.districts) {
      const normalized = normalizeName(district);
      if (Math.abs(normalized.length - token.length) > 2) continue;
      if (levenshtein(token, normalized, 2) <= 2) fuzzyMatches.add(district);
    }
  }
  if (fuzzyMatches.size === 1) {
    const district = [...fuzzyMatches][0];
    return { district, sector: sectorNameFor(sector, district) };
  }

  // --- 3. unambiguous sector ----------------------------------------------
  if (sectorDistricts && sectorDistricts.size === 1) {
    const district = [...sectorDistricts][0];
    return { district, sector: sectorNameFor(sector, district) };
  }

  return { district: null, sector: null };
}

function sectorNameFor(sectorToken: string | null, district: string): string | null {
  if (!sectorToken) return null;
  const index = getAdminIndex();
  const districts = index.districtsBySector.get(sectorToken);
  // Only report a sector we can confidently attach to the resolved district.
  if (!districts || !districts.has(district)) return null;
  return sectorToken;
}

// ---------------------------------------------------------------------------
// Point-in-polygon
// ---------------------------------------------------------------------------

let preparedPolygonsCache: PreparedPolygon[] | null = null;

function getPreparedPolygons(): PreparedPolygon[] {
  if (preparedPolygonsCache) return preparedPolygonsCache;

  const prepared: PreparedPolygon[] = [];
  const features = (boundaries as unknown as { features: CatchmentFeature[] }).features;

  for (const feature of features) {
    const code = feature.properties.code;
    const geometry = feature.geometry;
    const polygons: PolygonCoords[] =
      geometry.type === "Polygon"
        ? [geometry.coordinates as PolygonCoords]
        : (geometry.coordinates as PolygonCoords[]);

    for (const rings of polygons) {
      let minLng = Infinity;
      let minLat = Infinity;
      let maxLng = -Infinity;
      let maxLat = -Infinity;
      for (const [lng, lat] of rings[0]) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      prepared.push({ code, rings, bbox: [minLng, minLat, maxLng, maxLat] });
    }
  }

  preparedPolygonsCache = prepared;
  return prepared;
}

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng: number, lat: number, polygon: PreparedPolygon): boolean {
  const [minLng, minLat, maxLng, maxLat] = polygon.bbox;
  if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return false;
  if (!pointInRing(lng, lat, polygon.rings[0])) return false;
  for (let i = 1; i < polygon.rings.length; i++) {
    if (pointInRing(lng, lat, polygon.rings[i])) return false; // in a hole
  }
  return true;
}

export function catchmentCodeForCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): string | null {
  const lat = typeof latitude === "number" ? latitude : Number(latitude);
  const lng = typeof longitude === "number" ? longitude : Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < RWANDA_BBOX.minLat || lat > RWANDA_BBOX.maxLat) return null;
  if (lng < RWANDA_BBOX.minLng || lng > RWANDA_BBOX.maxLng) return null;

  for (const polygon of getPreparedPolygons()) {
    if (pointInPolygon(lng, lat, polygon)) return polygon.code;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Catchment labels
// ---------------------------------------------------------------------------

const CODE_TO_CATCHMENT = new Map(RWANDA_CATCHMENTS.map((c) => [c.code, c]));

export function catchmentLabelForCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return CODE_TO_CATCHMENT.get(code)?.level1Label ?? code;
}

/** All nine Level-I codes, in the official document order. */
export function allCatchmentCodes(): string[] {
  return RWANDA_CATCHMENTS.map((c) => c.code);
}

// ---------------------------------------------------------------------------
// Full resolution
// ---------------------------------------------------------------------------

interface OverlapEntry {
  /** Level-I code covering the largest share of the area. */
  code: string;
  /** Fraction of the area covered by that catchment, 0–1. */
  share: number;
}

const lookup = adminLookup as unknown as {
  districts: Record<string, OverlapEntry>;
  sectors: Record<string, OverlapEntry>;
};

/**
 * How much of a sector/district must sit inside one catchment before we are
 * willing to attribute a permit to it without coordinates.
 *
 * This threshold matters. Gicumbi, for example, splits roughly 55/45 between
 * Muvumba and Lower Nyabarongo, and 93 registry rows there carry the location
 * "Gicumbi District" and nothing more. Attributing them by bare majority moved
 * Muvumba from 13 permits to 122 — a visibly wrong picture on a public page.
 * Below the threshold we report the permit as unattributed instead of guessing.
 */
const MIN_OVERLAP_SHARE = 0.7;

function confidentCode(entry: OverlapEntry | undefined): string | null {
  if (!entry || typeof entry.code !== "string") return null;
  if (!(entry.share >= MIN_OVERLAP_SHARE)) return null;
  return entry.code;
}

export function resolveCatchment(row: {
  latitude?: number | string | null;
  longitude?: number | string | null;
  location?: string | null;
}): CatchmentResolution & DistrictResolution {
  const { district, sector } = resolveDistrictFromLocation(row.location);

  const byCoordinates = catchmentCodeForCoordinates(
    row.latitude as number | null,
    row.longitude as number | null
  );
  if (byCoordinates) {
    return {
      code: byCoordinates,
      label: catchmentLabelForCode(byCoordinates),
      source: "coordinates",
      district,
      sector,
    };
  }

  if (district && sector) {
    const bySector = confidentCode(
      lookup.sectors[`${normalizeName(district)}|${normalizeName(sector)}`]
    );
    if (bySector) {
      return {
        code: bySector,
        label: catchmentLabelForCode(bySector),
        source: "sector",
        district,
        sector,
      };
    }
  }

  if (district) {
    const byDistrict = confidentCode(lookup.districts[normalizeName(district)]);
    if (byDistrict) {
      return {
        code: byDistrict,
        label: catchmentLabelForCode(byDistrict),
        source: "district",
        district,
        sector,
      };
    }
  }

  return { code: null, label: null, source: "unresolved", district, sector };
}
