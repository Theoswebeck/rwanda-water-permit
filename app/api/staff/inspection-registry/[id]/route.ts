import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import { requireRole } from "@/lib/auth/require-role";
import {
  inspectionRegistryPatchSchema,
  inspectionRegistryVersionSchema,
  type InspectionRegistryPatchInput,
} from "@/lib/validation/inspection-registry";

/**
 * PATCH `/api/staff/inspection-registry/{id}`
 *
 * Corrects a "Water Users Inspection Register" row. Imported rows
 * (public.inspection_registry — the xlsx import) are updated in place. Rows
 * the unified register surfaces from approved system inspections
 * (`source_kind = 'system'`) are corrected through
 * public.inspection_registry_system_overrides, so the approved inspection
 * record itself is never rewritten; clearing a field there restores the
 * system value.
 *
 * Mirror of the permit-registry row editor: staff reviewers+admin only (plus the
 * superuser bypass inside requireRole), optimistic concurrency via
 * `expected_updated_at`, and only whitelisted columns are writable.
 */
const EDITOR_ROLES = ["assessor", "approver", "reviewer", "verifier", "admin"] as const;

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeVersion(value: string): number {
  return new Date(value).getTime();
}

function buildUpdateClauses(input: InspectionRegistryPatchInput): {
  clauses: string[];
  values: unknown[];
} {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const append = (fragment: (param: string) => string, value: unknown) => {
    values.push(value);
    clauses.push(fragment(`$${values.length}`));
  };
  const has = (key: keyof InspectionRegistryPatchInput) =>
    Object.prototype.hasOwnProperty.call(input, key);

  const textColumns = [
    "permit_holder",
    "permit_number",
    "activity",
    "district",
    "observation",
    "action",
    "inspection_date_text",
  ] as const;

  for (const key of textColumns) {
    if (has(key)) {
      append((p) => `${key} = ${p}`, input[key] ?? null);
    }
  }

  if (has("compliance_status")) {
    append((p) => `compliance_status = ${p}`, input.compliance_status ?? null);
  } else if (has("action")) {
    // Compliance is derived from the recorded action at read time whenever the
    // stored value is blank (see ../route.ts). When an assessor corrects the
    // action without explicitly setting compliance, clear the stored value so
    // the derived status follows the new action instead of the stale import.
    clauses.push(`compliance_status = NULL`);
  }

  return { clauses, values };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRole(req, EDITOR_ROLES);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid inspection registry id" },
        { status: 400 }
      );
    }

    const expectedUpdatedAtRaw = req.nextUrl.searchParams.get("expected_updated_at");
    const expectedVersion = inspectionRegistryVersionSchema.safeParse(expectedUpdatedAtRaw);
    if (!expectedVersion.success) {
      return NextResponse.json(
        {
          success: false,
          message: expectedVersion.error.issues[0]?.message || "Invalid expected_updated_at",
        },
        { status: 400 }
      );
    }

    const payload = await req.json().catch(() => null);
    const parsed = inspectionRegistryPatchSchema.safeParse(payload);
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
      return NextResponse.json(
        { success: false, message: "No editable fields were provided" },
        { status: 400 }
      );
    }

    const existing = await query<{ id: string; updated_at: string }>(
      `
      select id, updated_at
      from public.inspection_registry
      where id = $1
      limit 1
      `,
      [id]
    );

    const current = existing.rows[0];
    if (!current) {
      // The unified register also surfaces approved system inspections; those
      // ids live in public.inspections. Version token mirrors the list CTE.
      const system = await query<{ id: string; updated_at: string }>(
        `select i.id, greatest(i.updated_at, o.updated_at) as updated_at
         from public.inspections i
         left join public.inspection_registry_system_overrides o on o.inspection_id = i.id
         where i.id = $1 and i.workflow_status = 'approved'
         limit 1`,
        [id]
      );
      const systemRow = system.rows[0];
      if (systemRow) {
        if (normalizeVersion(systemRow.updated_at) !== normalizeVersion(expectedVersion.data)) {
          return NextResponse.json(
            { success: false, message: "This row changed while you were editing. Refresh and try again." },
            { status: 409 }
          );
        }
        await query(
          `insert into public.inspection_registry_system_overrides (inspection_id)
           values ($1) on conflict (inspection_id) do nothing`,
          [id]
        );
        values.push(auth.email || null);
        const byParam = `$${values.length}`;
        values.push(id);
        const idParam = `$${values.length}`;
        const result = await query(
          `
          update public.inspection_registry_system_overrides
          set
            ${clauses.join(", ")},
            updated_by = ${byParam},
            updated_at = now()
          where inspection_id = ${idParam}
          returning *
          `,
          values
        );
        return NextResponse.json({ success: true, item: result.rows[0] });
      }
      return NextResponse.json(
        { success: false, message: "Inspection registry row not found" },
        { status: 404 }
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
      update public.inspection_registry
      set
        ${clauses.join(", ")},
        updated_at = now()
      where id = ${idParam}
      returning *
      `,
      values
    );

    if (!result.rowCount) {
      return NextResponse.json(
        { success: false, message: "Inspection registry row not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, item: result.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("inspection-registry PATCH failed:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
