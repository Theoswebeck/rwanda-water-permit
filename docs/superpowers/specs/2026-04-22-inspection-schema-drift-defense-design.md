# Inspection Schema-Drift Defense — Design Spec

**Date:** 2026-04-22
**Status:** Approved (user instructed senior-engineer execution, no further gating)
**Owner:** Inspections / Platform

---

## 1. Problem

The inspection editor save path silently dropped form fields whose
matching column did not exist in `public.inspections`. The user reported
losing the yellow "(missing — editable)" overrides on
`/assessment/inspection/permit/0844/RWB/2025`; investigation also
identified `fees_payment_details` (Section 10) and `recommendation_details`
(Section 14) as silently-dropped on every save.

Yesterday's hotfix added a warning toast naming the dropped columns
("✅ Draft saved — ⚠️ 2 field(s) were not saved …"). That fixed
visibility but not the underlying loss: the user still sees a green
checkmark and may dismiss the warning.

## 2. Root cause

Three latent issues compound:

1. **No single source of truth for the `inspections` write payload.**
   `InspectionFormState` is hand-written TypeScript; the Postgres schema
   lives only in the database (and partially in stale snapshots). Nothing
   enforces agreement between them.
2. **`runWithMissingColumnRetries` is a kindness that became a hazard.**
   It was designed to keep the app running when migrations lag, by
   stripping unknown columns one by one and retrying up to 25 times.
   It silently converts data loss into a successful save.
3. **No build-time, boot-time, or request-time guard** stops a payload
   key without a column from reaching Postgres.

## 3. Goals

- **Make silent data loss physically impossible** in the inspection editor.
- **Detect schema drift before it ships** without manual diligence.
- **Keep partial-migration tolerance** for empty optional fields, so a
  dev can't accidentally block unrelated work.
- **No race conditions, no breaking changes** for the existing flows.

## 4. Architecture — defense in depth

Four layers. Any one alone is insufficient; together they make the
failure mode impossible.

### L1 — Migration (close the active wound)

A new SQL migration adding the two newly-identified missing columns:

```sql
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS fees_payment_details   text,
  ADD COLUMN IF NOT EXISTS recommendation_details text;

SELECT pg_notify('pgrst', 'reload schema');
```

The previously-shipped `2026-04-22-inspection-locked-field-overrides.sql`
is left in place — it has already been committed/pushed and may already
have been applied. Both migrations use `ADD COLUMN IF NOT EXISTS`, so
re-running either on a partially-migrated database is safe.

### L2 — Hardened client save (no silent loss)

A shared helper `lib/inspections/safe-payload-retry.ts` replaces the four
inline copies of `runWithMissingColumnRetries`. New rule:

| Outgoing value for missing column | Behavior |
|---|---|
| `null`, `undefined`, `""`, `[]`, `{}` | Drop silently, retry. (Field was empty.) |
| Anything else (real text/object/number) | **Throw** a hard error: "Cannot save: the database is missing column `X` but you've entered content for it. Your changes were NOT persisted. Contact an administrator." |

A user who never touched a field can still save (no spurious blocks);
the moment a field has user-typed content, the save must fully succeed
or the user sees an unmissable error. The "Draft saved + warning" toast
is removed — it was a half-measure that's no longer needed once L1 + L2
+ L3a are in place.

### L3a — Server-side schema guard (kill the retry loop entirely)

`app/api/internal/query/route.ts` gains a module-scoped column registry,
populated on first use from `information_schema.columns` (one query per
allowed table, gathered into a `Map<table, Set<column>>`). Concurrency
is handled by a single in-flight load promise (no races). TTL: 5 minutes,
plus invalidation when an `UNKNOWN_COLUMN` slipped through (covers a
migration applied at runtime).

Every `insert`/`update` validates payload keys against the registry up
front. Unknown column → `400 { code: 'UNKNOWN_COLUMN', table, column }`,
single round-trip, no Postgres call. The client helper recognizes this
code and surfaces the message exactly the same as the L2 path (so the
two error sources converge on the same UX).

### L3b — Source of truth + dev audit (catch drift before it ships)

- **Registry:** `lib/inspections/payload-columns.ts` exports
  `INSPECTION_PAYLOAD_COLUMNS` — the canonical list of every column the
  editor ever writes, with type and a `whenTemplate?: 'authorization' |
  'concession' | 'always'` discriminator. The four editor pages build
  their save payloads from this list, so it is mechanically impossible
  to send a key not in the registry.
- **Audit script:** `scripts/audit-inspections-schema.ts` connects to
  `DATABASE_URL`, diffs the registry against `information_schema.columns`,
  prints a ready-to-paste `ALTER TABLE` block, exits non-zero on drift.
  Wired as `npm run audit:inspections-schema`. Suitable for a pre-deploy
  check, manual run, or CI hook.

## 5. Components & files

| File | Purpose |
|---|---|
| `database/migrations/2026-04-22-inspection-missing-payload-columns.sql` | L1 — adds `fees_payment_details`, `recommendation_details` |
| `database/migrations/2026-04-22-inspection-locked-field-overrides.sql` | (already exists, unchanged) — adds `locked_field_overrides` |
| `lib/inspections/payload-columns.ts` | L3b — single source of truth for inspection write columns |
| `lib/inspections/safe-payload-retry.ts` | L2 — shared client save helper, hard-fails on non-empty drops |
| `app/api/internal/query/route.ts` | L3a — adds boot-cached column registry + UNKNOWN_COLUMN guard |
| `app/{assessment,review,verification,approver}/inspection/permit/[id]/page.tsx` | Wire to shared helper; build payload from registry; remove inline copy |
| `scripts/audit-inspections-schema.ts` | L3b — drift detector, emits SQL |
| `package.json` | Adds `audit:inspections-schema` script |

## 6. Data flow on save

```
[Editor page]
  build payload from INSPECTION_PAYLOAD_COLUMNS
       │
       ▼
[safePayloadRetry]
  POST /api/internal/query  (action: update, table: inspections)
       │
       ▼
[/api/internal/query]
  load schema cache if missing/stale (one in-flight promise)
  for each payload key:
     if not in cache → 400 UNKNOWN_COLUMN  ─┐
  else: run UPDATE                          │
       │                                    │
       ▼                                    │
   Postgres                                 │
       │                                    │
       ▼                                    │
  [safePayloadRetry]  ◄────────────────────┘
    if UNKNOWN_COLUMN and value is empty: drop key, retry
    if UNKNOWN_COLUMN and value is non-empty: throw HARD
    on success: return data + droppedColumns:[]   (always [])
```

The retry loop still exists, but only for the harmless case (empty
field, missing column). For any case with real user content, the user
gets a real error, not a green check.

## 7. Concurrency & error handling

- The schema-cache loader uses a single shared `Promise` to coalesce
  concurrent requests; no race possible. Reads after the load are
  read-only against an immutable `Set`.
- Cache refresh is idempotent (replace-on-success). A failed reload
  leaves the previous cache in place.
- The dev audit script never writes; it only reads `information_schema`
  and prints SQL. No risk of accidental schema mutation.

## 8. Testing

- Manual: re-test the user's reproducer
  (`/assessment/inspection/permit/0844%2FRWB%2F2025`) — yellow fields
  and recommendation/fees details persist after refresh once the
  migration is run.
- Manual negative test (pre-migration): confirm that typing into
  Section 14 details and saving produces the new hard error rather than
  a green toast.
- `npm run audit:inspections-schema` against the dev DB: expect "no
  drift" once the migration is run; expect a printed ALTER block when
  drift is introduced.

## 9. Rollout

1. Merge code to `chore/stage-unstaged-2026-03-01` and
   `chore/stage-unstaged-2026-03-01-uat`.
2. Apply L1 migration in Supabase SQL editor on **both** prod and
   staging databases.
3. Run `npm run audit:inspections-schema` against each DB after deploy
   to confirm zero drift.

## 10. Out of scope

- Migrating the two-folder layout (`database/migrations/` vs
  `database/supabase/`) into a single ordered tool. Worth doing later;
  not blocking this fix.
- Extending the same defense to other tables (`applications`,
  `water_use_reports`, etc.). The L3a server guard already covers them
  trivially since it's table-agnostic; the L3b registry pattern can be
  cloned per table when the same drift appears.
