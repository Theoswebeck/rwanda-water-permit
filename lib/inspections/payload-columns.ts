/**
 * Single source of truth for every column the inspection editor (across
 * the assessment / review / verification / approver pages) writes into
 * `public.inspections`.
 *
 * The actual column list lives in `payload-columns.data.json` so it can
 * be consumed by both this TypeScript module and the plain-JS audit
 * script (`scripts/audit-inspections-schema.mjs`) without a build step
 * or a TS runtime.
 *
 * Why this exists:
 *   The editor used to send fields whose matching DB column did not
 *   exist. The client-side missing-column retry helper silently dropped
 *   those keys and reported the save as successful, causing the user to
 *   lose paragraphs of typed content.
 *
 * Contract:
 *   - Every key in any save payload built by an editor page MUST appear
 *     in {@link INSPECTION_PAYLOAD_COLUMN_NAMES}. Pages call
 *     {@link assertInspectionPayloadKeys} right before posting; an
 *     unknown key throws immediately so it's caught the first time a
 *     developer saves in dev.
 *   - Every column listed here MUST exist in the database. Run
 *     `npm run audit:inspections-schema` to detect drift.
 *
 * When you add a new field to the inspection form:
 *   1. Add the column to `payload-columns.data.json` with its Postgres type.
 *   2. Write a migration adding the column.
 *   3. Apply the migration to prod and staging.
 *   4. `npm run audit:inspections-schema` should report "no drift".
 */

import payloadColumnsData from "./payload-columns.data.json";

export type InspectionPayloadColumnType =
  | "uuid"
  | "text"
  | "timestamptz"
  | "date"
  | "numeric"
  | "boolean"
  | "jsonb";

export interface InspectionPayloadColumn {
  /** Postgres column name in `public.inspections`. */
  name: string;
  /** Postgres type. Used by the dev audit script to emit accurate ALTER TABLE. */
  type: InspectionPayloadColumnType;
  /** Free-text note for humans reading the audit output. */
  note?: string;
}

export const INSPECTION_PAYLOAD_COLUMNS: ReadonlyArray<InspectionPayloadColumn> =
  payloadColumnsData.columns as ReadonlyArray<InspectionPayloadColumn>;

/** Fast lookup set built once at module load. */
export const INSPECTION_PAYLOAD_COLUMN_NAMES: ReadonlySet<string> = new Set(
  INSPECTION_PAYLOAD_COLUMNS.map((c) => c.name),
);

/**
 * Throw immediately if any key in the supplied payload is not registered
 * in {@link INSPECTION_PAYLOAD_COLUMNS}. Call this in the editor page
 * right before posting to `/api/internal/query`.
 *
 * Catches schema drift introduced by adding a key to the payload without
 * adding the corresponding entry here (and, by extension, without writing
 * a migration).
 */
export function assertInspectionPayloadKeys(payload: Record<string, unknown>): void {
  const unknown: string[] = [];
  for (const key of Object.keys(payload)) {
    if (!INSPECTION_PAYLOAD_COLUMN_NAMES.has(key)) unknown.push(key);
  }
  if (unknown.length) {
    throw new Error(
      `Inspection payload contains unregistered column(s): ${unknown.join(", ")}. ` +
        `Add them to lib/inspections/payload-columns.data.json and write a migration ` +
        `before sending them to the database.`,
    );
  }
}
