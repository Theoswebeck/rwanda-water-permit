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
        latitude: parseCoordinate(fields[9]),
        longitude: parseCoordinate(fields[10]),
        issuance_date: parseDate(fields[11]),
        duration: fields[12]?.trim() || null,
        expiration_date: parseDate(fields[13]),
        status: fields[14]?.trim()?.toUpperCase() || "OPERATIONAL",
        contact: fields[15]?.trim() || null,
      };

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
            created_at,
            updated_at
          ) values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now()
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
            row.latitude,
            row.longitude,
            row.issuance_date,
            row.duration,
            row.expiration_date,
            row.status,
            row.contact,
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
