import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import { getConcessionPolygonWkt } from "@/lib/permit/registry-coordinates";
import { deriveRegistryStatus } from "@/lib/permit/registry-status";
import {
  permitRegistryPatchSchema,
  permitRegistryVersionSchema,
  type PermitRegistryPatchInput,
} from "@/lib/validation/permit-registry";

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isMissingColumnError(error: unknown): boolean {
  const pgCode =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  return pgCode === "42703";
}

function normalizeVersion(value: string): number {
  return new Date(value).getTime();
}

function buildUpdateClauses(input: PermitRegistryPatchInput): {
  clauses: string[];
  values: unknown[];
} {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const append = (column: string, value: unknown) => {
    values.push(value);
    clauses.push(`${column} = $${values.length}`);
  };

  const editableColumns: Array<keyof PermitRegistryPatchInput> = [
    "permit_holder",
    "permit_number",
    "regime",
    "water_source",
    "volume_or_area",
    "method_of_water_taking",
    "authorized_activity",
    "location",
    "latitude",
    "longitude",
    "issuance_date",
    "duration",
    "expiration_date",
    "status",
    "contact",
  ];

  for (const key of editableColumns) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      append(key, input[key] ?? null);
    }
  }

  return { clauses, values };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, message: "Invalid permit registry id" }, { status: 400 });
    }

    const expectedUpdatedAtRaw = req.nextUrl.searchParams.get("expected_updated_at");
    const expectedVersion = permitRegistryVersionSchema.safeParse(expectedUpdatedAtRaw);
    if (!expectedVersion.success) {
      return NextResponse.json({ success: false, message: expectedVersion.error.issues[0]?.message || "Invalid expected_updated_at" }, { status: 400 });
    }

    const payload = await req.json().catch(() => null);
    const parsed = permitRegistryPatchSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid payload",
          errors: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const hasBoundaryEdit =
      typeof parsed.data.concession_coordinates === "string" &&
      parsed.data.concession_coordinates.trim().length > 0;
    if (buildUpdateClauses(parsed.data).clauses.length === 0 && !hasBoundaryEdit) {
      return NextResponse.json({ success: false, message: "No editable fields were provided" }, { status: 400 });
    }

    const existing = await query<{
      id: string;
      updated_at: string;
      deleted_at: string | null;
      row_index: number | null;
      regime: string | null;
      status: string | null;
      latitude: number | null;
      longitude: number | null;
      expiration_date: string | null;
    }>(
      `
      select id, updated_at, deleted_at, row_index, regime, status, latitude, longitude,
             expiration_date::text as expiration_date
      from public.permit_registry
      where id = $1
      limit 1
      `,
      [id]
    );

    const current = existing.rows[0];
    if (!current || current.deleted_at) {
      return NextResponse.json({ success: false, message: "Permit registry row not found" }, { status: 404 });
    }
    if (current.row_index == null) {
      return NextResponse.json(
        {
          success: false,
          message: "System-issued permits cannot be edited from the registry.",
        },
        { status: 403 }
      );
    }

    if (normalizeVersion(current.updated_at) !== normalizeVersion(expectedVersion.data)) {
      return NextResponse.json(
        { success: false, message: "This row changed while you were editing. Refresh and try again." },
        { status: 409 }
      );
    }

    // Geometry for an existing permit (RWB: "the system does not allow the
    // addition of the existing concession/coordinates"). `concession_coordinates`
    // is not a column — it becomes map_geometry so the row shows on the map.
    // Only appended when the caller actually supplied coordinates, so ordinary
    // edits keep their existing SQL and failure modes.
    const patch = parsed.data;
    // Operational/Expired always follow the expiration date; only
    // suspended/revoked/cancelled are kept as chosen. Recomputed whenever the
    // status or the expiry is edited, so a renewed date revives an expired row.
    const effStatus = patch.status !== undefined ? patch.status : current.status;
    const effExpiry = patch.expiration_date !== undefined ? patch.expiration_date : current.expiration_date;
    if (patch.status !== undefined || patch.expiration_date !== undefined) {
      patch.status = deriveRegistryStatus(effStatus, effExpiry);
    }
    const { clauses, values } = buildUpdateClauses(patch);

    // lib/permitPolygons.ts only renders rows whose map_status is set, so any
    // geometry we write must carry one. Falls back to the row's current status:
    // editing only the coordinates of a cancelled permit must not flip its map
    // pin back to active.
    const mapStatus = (() => {
      const status = deriveRegistryStatus(effStatus, effExpiry);
      if (status === "SUSPENDED") return "suspended";
      if (status === "REVOKED" || status === "CANCELLED") return "revoked";
      return status === "EXPIRED" ? "expired" : "active";
    })();
    const appendMapStatus = () => {
      values.push(mapStatus);
      clauses.push(`map_status = $${values.length}::permit_status`);
    };
    const suppliedBoundary =
      typeof patch.concession_coordinates === "string" ? patch.concession_coordinates.trim() : "";
    const effRegime = patch.regime !== undefined ? patch.regime : current.regime;
    const effLat = patch.latitude !== undefined ? patch.latitude : current.latitude;
    const effLng = patch.longitude !== undefined ? patch.longitude : current.longitude;

    if (suppliedBoundary) {
      const wkt = getConcessionPolygonWkt(effRegime ?? null, suppliedBoundary, undefined);
      if (!wkt) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Concession coordinates must be a concession permit with at least 3 points, e.g. \"-1.9441,30.0619; -1.9452,30.0631; -1.9463,30.0625\".",
          },
          { status: 400 }
        );
      }
      values.push(wkt);
      clauses.push(`map_geometry = ST_GeomFromText($${values.length}::text, 4326)`);
      clauses.push(`map_updated_at = now()`);
      appendMapStatus();
    } else if (
      (patch.latitude !== undefined || patch.longitude !== undefined) &&
      typeof effLat === "number" &&
      typeof effLng === "number"
    ) {
      values.push(effLng);
      const lngParam = `$${values.length}`;
      values.push(effLat);
      const latParam = `$${values.length}`;
      clauses.push(
        `map_geometry = ST_SetSRID(ST_MakePoint(${lngParam}::double precision, ${latParam}::double precision), 4326)`
      );
      clauses.push(`map_updated_at = now()`);
      appendMapStatus();
    } else if (patch.status !== undefined) {
      // Keep an existing map pin in step with the new status.
      values.push(mapStatus);
      clauses.push(`map_status = case when map_status is null then null else $${values.length}::permit_status end`);
    }

    values.push(id);
    const idParam = `$${values.length}`;
    const result = await query(
      `
      update public.permit_registry
      set
        ${clauses.join(", ")},
        updated_at = now()
      where id = ${idParam}
        and row_index is not null
        and deleted_at is null
      returning *
      `,
      values
    );

    if (!result.rowCount) {
      return NextResponse.json({ success: false, message: "Permit registry row not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      item: result.rows[0],
    });
  } catch (error) {
    if (isMissingColumnError(error)) {
      return NextResponse.json(
        {
          success: false,
          message: "Database is missing permit registry edit/delete columns. Run the latest migration and retry.",
        },
        { status: 503 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, message: "Invalid permit registry id" }, { status: 400 });
    }

    const result = await query(
      `
      update public.permit_registry
      set
        deleted_at = now(),
        updated_at = now()
      where id = $1
        and row_index is not null
        and deleted_at is null
      returning id
      `,
      [id]
    );

    if (!result.rowCount) {
      return NextResponse.json({ success: false, message: "Permit registry row not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    if (isMissingColumnError(error)) {
      return NextResponse.json(
        {
          success: false,
          message: "Database is missing permit registry edit/delete columns. Run the latest migration and retry.",
        },
        { status: 503 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
