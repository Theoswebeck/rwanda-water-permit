import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

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

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;

  const isoMatch = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return toISODate(year, month, day);
  }

  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!slashMatch) return null;

  const first = Number(slashMatch[1]);
  const second = Number(slashMatch[2]);
  const year = Number(slashMatch[3]);

  // Accept both DD/MM/YYYY and MM/DD/YYYY to prevent imports from failing.
  if (first > 12 && second <= 12) return toISODate(year, second, first);
  if (second > 12 && first <= 12) return toISODate(year, first, second);

  // Ambiguous dates default to DD/MM/YYYY (legacy dataset expectation).
  return toISODate(year, second, first);
}

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

function normalizeMapStatus(status: string | undefined, expirationDate: string | null): "active" | "expired" | "expiring_soon" | "suspended" | "revoked" {
  const normalized = status?.trim().toLowerCase() || "";
  if (normalized === "expired") return "expired";
  if (normalized === "expiring_soon" || normalized === "expiring soon") return "expiring_soon";
  if (normalized === "suspended") return "suspended";
  if (normalized === "revoked") return "revoked";
  if (normalized === "active" || normalized === "operational" || normalized === "approved" || normalized === "valid") {
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    if (!body.trim()) {
      return NextResponse.json({ error: "Empty CSV body" }, { status: 400 });
    }

    const lines = body.split(/\r?\n/);
    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 });
    }

    // Skip header row
    const dataLines = lines.slice(1);
    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i].trim();
      if (!line) {
        skipped++;
        continue;
      }

      const fields = parseCSVLine(line);
      const latitudeRaw = fields[9];
      const longitudeRaw = fields[10];

      const serialNumber = fields[0] ? parseInt(fields[0], 10) : null;
      const permitHolder = fields[1]?.trim();
      const permitNumber = fields[2]?.trim();

      if (!permitHolder || !permitNumber) {
        skipped++;
        continue;
      }

      const row = {
        serial_number: Number.isFinite(serialNumber) ? serialNumber : null,
        permit_holder: permitHolder,
        permit_number: permitNumber,
        regime: fields[3]?.trim() || null,
        water_source: fields[4]?.trim() || null,
        volume_or_area: fields[5]?.trim() || null,
        method_of_water_taking: fields[6]?.trim() || null,
        authorized_activity: fields[7]?.trim() || null,
        location: fields[8]?.trim() || null,
        latitude: parseCoordinate(latitudeRaw),
        longitude: parseCoordinate(longitudeRaw),
        issuance_date: parseDate(fields[11]),
        duration: fields[12]?.trim() || null,
        expiration_date: parseDate(fields[13]),
        status: fields[14]?.trim()?.toUpperCase() || "OPERATIONAL",
        contact: fields[15]?.trim() || null,
      };

      let latitude = row.latitude;
      let longitude = row.longitude;
      if (latitude !== null && !isLatitudeInRange(latitude)) {
        errors.push(`Row ${i + 2}: latitude out of range (${latitude}) - stored as NULL`);
        latitude = null;
      }
      if (longitude !== null && !isLongitudeInRange(longitude)) {
        errors.push(`Row ${i + 2}: longitude out of range (${longitude}) - stored as NULL`);
        longitude = null;
      }

      const mapStatus = normalizeMapStatus(row.status, row.expiration_date);
      const mapPurpose = normalizeMapPurpose(row.authorized_activity || undefined, row.water_source || undefined);
      const concessionPolygonWkt = getConcessionPolygonWkt(row.regime, latitudeRaw, longitudeRaw);

      try {
        await query(
          `
          insert into public.permit_registry (
            serial_number,
            permit_holder,
            permit_number,
            regime,
            water_source,
            volume_or_area,
            method_of_water_taking,
            authorized_activity,
            location,
            latitude,
            longitude,
            issuance_date,
            duration,
            expiration_date,
            status,
            contact,
            map_geometry,
            map_status,
            map_purpose,
            map_updated_at,
            created_at,
            updated_at
          ) values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
            case
              when $19::text is not null
              then ST_GeomFromText($19::text, 4326)
              when $10::double precision is not null and $11::double precision is not null
              then ST_SetSRID(ST_MakePoint($11::double precision, $10::double precision), 4326)
              else null
            end,
            $17::permit_status,
            $18::water_purpose,
            now(),
            now(),
            now()
          )
          on conflict (permit_number) do update set
            serial_number = excluded.serial_number,
            permit_holder = excluded.permit_holder,
            regime = excluded.regime,
            water_source = excluded.water_source,
            volume_or_area = excluded.volume_or_area,
            method_of_water_taking = excluded.method_of_water_taking,
            authorized_activity = excluded.authorized_activity,
            location = excluded.location,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            issuance_date = excluded.issuance_date,
            duration = excluded.duration,
            expiration_date = excluded.expiration_date,
            status = excluded.status,
            contact = excluded.contact,
            map_geometry = excluded.map_geometry,
            map_status = excluded.map_status,
            map_purpose = excluded.map_purpose,
            map_updated_at = now(),
            updated_at = now()
          `,
          [
            row.serial_number,
            row.permit_holder,
            row.permit_number,
            row.regime,
            row.water_source,
            row.volume_or_area,
            row.method_of_water_taking,
            row.authorized_activity,
            row.location,
            latitude,
            longitude,
            row.issuance_date,
            row.duration,
            row.expiration_date,
            row.status,
            row.contact,
            mapStatus,
            mapPurpose,
            concessionPolygonWkt,
          ]
        );
        inserted++;
      } catch (error) {
        errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : "Insert failed"}`);
      }
    }

    return NextResponse.json({
      success: true,
      inserted,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
