import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
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

    const { clauses, values } = buildUpdateClauses(parsed.data);
    if (clauses.length === 0) {
      return NextResponse.json({ success: false, message: "No editable fields were provided" }, { status: 400 });
    }

    const existing = await query<{ id: string; updated_at: string; deleted_at: string | null; row_index: number | null }>(
      `
      select id, updated_at, deleted_at, row_index
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

    values.push(id);
    const idParam = `$${values.length}`;
    const result = await query(
      `
      update public.permit_registry
      set
        ${clauses.join(", ")},
        manually_edited_at = now(),
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
