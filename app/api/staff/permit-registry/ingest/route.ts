import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function toISODate(year: number, month: number, day: number): string | null {
  if (!isValidDateParts(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Convert an Excel serial date number to an ISO date string. */
function excelSerialToISODate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  // Excel epoch is 1899-12-30; serial 1 = 1900-01-01.
  // Lotus 1900 leap-year bug: Excel thinks 1900 was a leap year, so serials
  // >= 60 (1900-02-29 which doesn't exist) are off by one day.
  const adjustedSerial = serial > 59 ? serial - 1 : serial;
  const ms = (adjustedSerial - 1) * 86400000;
  const epoch = Date.UTC(1900, 0, 1);
  const dt = new Date(epoch + ms);
  if (Number.isNaN(dt.getTime())) return null;
  return toISODate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Parse a date string in DD/MM/YYYY or YYYY-MM-DD format. */
function parseDateString(raw: string): string | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;

  const isoMatch = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    return toISODate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!slashMatch) return null;

  const first = Number(slashMatch[1]);
  const second = Number(slashMatch[2]);
  const year = Number(slashMatch[3]);

  if (first > 12 && second <= 12) return toISODate(year, second, first);
  if (second > 12 && first <= 12) return toISODate(year, first, second);

  // Ambiguous — default to DD/MM/YYYY (legacy dataset expectation).
  return toISODate(year, second, first);
}

/**
 * Parse a date cell. Handles:
 * - Excel serial dates (numeric cells like 41493)
 * - String dates in DD/MM/YYYY or YYYY-MM-DD format
 * - Annotated dates like "18/09/2014 (Amended to 3/7/2020)" — extracts the
 *   first recognisable date; the full text is preserved in *_raw columns.
 */
function parseDateCell(rawValue: string | undefined): string | null {
  if (!rawValue) return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  // Purely numeric → Excel serial
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return excelSerialToISODate(Number(trimmed));
  }

  // Try exact parse first
  const exact = parseDateString(trimmed);
  if (exact) return exact;

  // Try to extract the first DD/MM/YYYY or YYYY-MM-DD from a longer string
  const firstSlash = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (firstSlash) {
    const first = Number(firstSlash[1]);
    const second = Number(firstSlash[2]);
    const year = Number(firstSlash[3]);
    if (first > 12 && second <= 12) return toISODate(year, second, first);
    if (second > 12 && first <= 12) return toISODate(year, first, second);
    return toISODate(year, second, first);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Coordinate helpers (unchanged from original)
// ---------------------------------------------------------------------------

function parseCoordinate(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/°/g, "").trim();
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseCoordinateList(raw: string | undefined): number[] {
  if (!raw) return [];
  const cleaned = raw.replace(/°/g, " ").trim();
  if (!cleaned) return [];
  const matches = cleaned.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value));
}

function isLatitudeInRange(value: number): boolean {
  return value >= -90 && value <= 90;
}

function isLongitudeInRange(value: number): boolean {
  return value >= -180 && value <= 180;
}

function hasSamePoint(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function parseCoordinatePairsFromSingleField(raw: string | undefined): Array<[number, number]> {
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

function getConcessionPolygonWkt(
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
    if (!isLatitudeInRange(lat) || !isLongitudeInRange(lng)) {
      return null;
    }
  }

  const ring: Array<[number, number]> = [...latLngPairs];
  if (!hasSamePoint(ring[0], ring[ring.length - 1])) {
    ring.push(ring[0]);
  }

  const wktCoords = ring.map(([lat, lng]) => `${lng} ${lat}`).join(",");
  return `POLYGON((${wktCoords}))`;
}

// ---------------------------------------------------------------------------
// Map normalisation helpers (unchanged from original)
// ---------------------------------------------------------------------------

function normalizeMapStatus(status: string | undefined, expirationDate: string | null): "active" | "expired" | "expiring_soon" | "suspended" | "revoked" {
  const normalized = status?.trim().toLowerCase() || "";
  if (normalized.includes("expired")) return "expired";
  if (normalized === "expiring_soon" || normalized === "expiring soon") return "expiring_soon";
  if (normalized.includes("suspended")) return "suspended";
  if (normalized.includes("revoked")) return "revoked";
  if (normalized.includes("cancelled") || normalized.includes("canceled")) return "revoked";
  if (normalized === "active" || normalized.includes("operational") || normalized === "approved" || normalized === "valid") {
    return "active";
  }

  if (expirationDate) {
    const exp = new Date(`${expirationDate}T00:00:00.000Z`);
    if (!Number.isNaN(exp.getTime()) && exp < new Date()) return "expired";
  }

  return "active";
}

function normalizeMapPurpose(activity: string | undefined, waterSource: string | undefined): "domestic" | "irrigation" | "industrial" | "livestock" | "fish_farming_lakes" | "fish_farming_ponds" | "recreation_activities" | "recreation" | "electricity_generation" | "mining" | "municipal_supply" | "other" {
  const text = `${activity || ""} ${waterSource || ""}`.trim().toLowerCase();
  if (!text) return "other";
  if (text.includes("domestic")) return "domestic";
  if (text.includes("irrigation")) return "irrigation";
  if (text.includes("industrial")) return "industrial";
  if (text.includes("livestock")) return "livestock";
  if (text.includes("fish") && text.includes("lake")) return "fish_farming_lakes";
  if (text.includes("fish") && (text.includes("pond") || text.includes("aquaculture"))) return "fish_farming_ponds";
  if (text.includes("recreation") && text.includes("activit")) return "recreation_activities";
  if (text.includes("recreation")) return "recreation";
  if (text.includes("electricity") || text.includes("hydro")) return "electricity_generation";
  if (text.includes("mining")) return "mining";
  if (text.includes("municipal") || text.includes("public supply")) return "municipal_supply";
  return "other";
}

// ---------------------------------------------------------------------------
// XLSX cell helpers
// ---------------------------------------------------------------------------

/** Read a cell value as a trimmed string, handling all SheetJS cell types. */
function cellText(ws: XLSX.WorkSheet, cellRef: string): string {
  const cell = ws[cellRef];
  if (!cell) return "";
  // For dates stored as numbers, prefer the raw value so our parser handles it
  if (cell.t === "n") return String(cell.v ?? "");
  // Use SheetJS formatted text for everything else
  return String(cell.w ?? cell.v ?? "").trim();
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded. Send multipart/form-data with a 'file' field." }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      return NextResponse.json({ error: "Only .xlsx or .xls files are accepted." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });

    // Find the REGISTER sheet (case-insensitive)
    const sheetName = workbook.SheetNames.find((n) => n.toUpperCase().includes("REGISTER"))
      || workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];
    if (!ws) {
      return NextResponse.json({ error: "No worksheet found in the uploaded file." }, { status: 400 });
    }

    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    const lastRow = range.e.r; // 0-based
    if (lastRow < 1) {
      return NextResponse.json({ error: "Worksheet must have a header row and at least one data row." }, { status: 400 });
    }

    // Build row payloads
    const colLetter = (c: number) => XLSX.utils.encode_col(c);

    interface RowPayload {
      serialNumber: number | null;
      permitHolder: string | null;
      permitNumber: string | null;
      regime: string | null;
      waterSource: string | null;
      volumeOrArea: string | null;
      method: string | null;
      activity: string | null;
      location: string | null;
      latitude: number | null;
      longitude: number | null;
      issuanceDate: string | null;
      issuanceDateRaw: string | null;
      expirationDate: string | null;
      expirationDateRaw: string | null;
      duration: string | null;
      status: string | null;
      contact: string | null;
      mapStatus: string;
      mapPurpose: string;
      polygonWkt: string | null;
      rowIndex: number;
    }

    const rows: RowPayload[] = [];
    let dateParseFailures = 0;
    let coordParseFailures = 0;
    const errors: string[] = [];

    for (let r = 1; r <= lastRow; r++) {
      const ref = (c: number) => `${colLetter(c)}${r + 1}`; // +1 because SheetJS is 1-based in refs

      const serialRaw = cellText(ws, ref(0));
      const permitHolder = cellText(ws, ref(1)) || null;
      const permitNumber = cellText(ws, ref(2)) || null;
      const regime = cellText(ws, ref(3)) || null;
      const waterSource = cellText(ws, ref(4)) || null;
      const volumeOrArea = cellText(ws, ref(5)) || null;
      const method = cellText(ws, ref(6)) || null;
      const activity = cellText(ws, ref(7)) || null;
      const location = cellText(ws, ref(8)) || null;
      const latitudeRaw = cellText(ws, ref(9));
      const longitudeRaw = cellText(ws, ref(10));
      const issuanceDateRaw = cellText(ws, ref(11));
      const durationRaw = cellText(ws, ref(12)) || null;
      const expirationDateRaw = cellText(ws, ref(13));
      const status = cellText(ws, ref(14)) || null;
      const contact = cellText(ws, ref(15)) || null;

      // Skip completely empty rows
      if (!permitHolder && !permitNumber && !waterSource && !status && !activity) {
        continue;
      }

      const serialNumber = serialRaw ? parseInt(serialRaw, 10) : null;
      const issuanceDate = parseDateCell(issuanceDateRaw);
      const expirationDate = parseDateCell(expirationDateRaw);

      if (issuanceDateRaw && !issuanceDate) dateParseFailures++;
      if (expirationDateRaw && !expirationDate) dateParseFailures++;

      let latitude = parseCoordinate(latitudeRaw);
      let longitude = parseCoordinate(longitudeRaw);
      if (latitude !== null && !isLatitudeInRange(latitude)) {
        errors.push(`Row ${r + 1}: latitude out of range (${latitude}) - stored as NULL`);
        latitude = null;
        coordParseFailures++;
      }
      if (longitude !== null && !isLongitudeInRange(longitude)) {
        errors.push(`Row ${r + 1}: longitude out of range (${longitude}) - stored as NULL`);
        longitude = null;
        coordParseFailures++;
      }

      rows.push({
        serialNumber: Number.isFinite(serialNumber) ? serialNumber : null,
        permitHolder,
        permitNumber,
        regime,
        waterSource,
        volumeOrArea,
        method,
        activity,
        location,
        latitude,
        longitude,
        issuanceDate,
        issuanceDateRaw: issuanceDateRaw || null,
        expirationDate,
        expirationDateRaw: expirationDateRaw || null,
        duration: durationRaw,
        status,
        contact,
        mapStatus: normalizeMapStatus(status || undefined, expirationDate),
        mapPurpose: normalizeMapPurpose(activity || undefined, waterSource || undefined),
        polygonWkt: getConcessionPolygonWkt(regime, latitudeRaw, longitudeRaw),
        rowIndex: r, // 1-based: Excel row 2 → row_index 1
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No data rows found in the REGISTER sheet." }, { status: 400 });
    }

    // Run TRUNCATE + bulk INSERT inside a single transaction
    await query("BEGIN");
    try {
      await query("TRUNCATE public.permit_registry");

      const INSERT_SQL = `
        INSERT INTO public.permit_registry (
          id, serial_number, permit_holder, permit_number, regime,
          water_source, volume_or_area, method_of_water_taking,
          authorized_activity, location, latitude, longitude,
          issuance_date, issuance_date_raw, expiration_date, expiration_date_raw,
          duration, status, contact, row_index,
          map_geometry, map_status, map_purpose,
          map_updated_at, created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19,
          CASE
            WHEN $22::text IS NOT NULL
            THEN ST_GeomFromText($22::text, 4326)
            WHEN $10::double precision IS NOT NULL AND $11::double precision IS NOT NULL
            THEN ST_SetSRID(ST_MakePoint($11::double precision, $10::double precision), 4326)
            ELSE NULL
          END,
          $20::permit_status,
          $21::water_purpose,
          now(), now(), now()
        )
      `;

      let inserted = 0;
      for (const row of rows) {
        await query(INSERT_SQL, [
          row.serialNumber,      // $1
          row.permitHolder,      // $2
          row.permitNumber,      // $3
          row.regime,            // $4
          row.waterSource,       // $5
          row.volumeOrArea,      // $6
          row.method,            // $7
          row.activity,          // $8
          row.location,          // $9
          row.latitude,          // $10
          row.longitude,         // $11
          row.issuanceDate,      // $12
          row.issuanceDateRaw,   // $13
          row.expirationDate,    // $14
          row.expirationDateRaw, // $15
          row.duration,          // $16
          row.status,            // $17
          row.contact,           // $18
          row.rowIndex,          // $19
          row.mapStatus,         // $20
          row.mapPurpose,        // $21
          row.polygonWkt,        // $22
        ]);
        inserted++;
      }

      await query("COMMIT");

      // Re-link inspections whose owner_id pointed to old registry UUIDs (pre-TRUNCATE).
      // The permit number is preserved in locked_field_overrides->>'permitNumber'.
      await query(`
        UPDATE public.inspections i
        SET owner_id = pr.id
        FROM (
          SELECT DISTINCT ON (permit_number) id, permit_number
          FROM public.permit_registry
          WHERE permit_number IS NOT NULL
          ORDER BY permit_number, row_index DESC NULLS LAST
        ) pr
        WHERE i.owner_kind = 'permit_registry'
          AND pr.permit_number = i.locked_field_overrides->>'permitNumber'
          AND i.owner_id IS DISTINCT FROM pr.id
      `).catch((e) => {
        console.warn("⚠️ owner_id re-link after registry import failed (non-fatal):", e?.message);
      });

      return NextResponse.json({
        success: true,
        inserted,
        dateParseFailures,
        coordParseFailures,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (txErr) {
      await query("ROLLBACK").catch(() => {});
      throw txErr;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
