/**
 * Runtime invariant tests for `lib/permit/resolve-issue-date.ts`.
 *
 * The helper is the single source of truth for the permit "issuance date"
 * shown in every preview, every final PDF, and every registry sync. The same
 * rule applies to all application types (new / renewal / modification /
 * transfer):
 *
 *   1. permits.issued_date wins (post-issuance lock)
 *   2. else applications.approved_at (approver-signed lock)
 *   3. else today (preview / pending approval)
 *
 * Also exercises the input parser so date-only / ISO / US-date / Date /
 * empty / garbage all degrade in the documented way.
 *
 * Run with: npx tsx scripts/check-resolve-issue-date.ts
 *
 * Exits non-zero on any failure.
 */

import { resolvePermitIssueDate } from "../lib/permit/resolve-issue-date";

let passes = 0;
let failures = 0;

function eq(actual: unknown, expected: unknown, label: string): void {
  const okActual = actual instanceof Date ? actual.toISOString() : actual;
  const okExpected = expected instanceof Date ? expected.toISOString() : expected;
  if (okActual === okExpected) {
    passes += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(okExpected)}`);
    console.error(`    actual:   ${JSON.stringify(okActual)}`);
  }
}

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

const FIXED_NOW = new Date("2026-04-29T08:32:00Z");
const fixedClock = () => new Date(FIXED_NOW.getTime());

group("priority order", () => {
  // 1. permits.issued_date wins over everything else.
  eq(
    resolvePermitIssueDate({
      permitIssuedDate: "2024-01-15",
      approvedAt: "2026-04-28T10:00:00Z",
      now: fixedClock,
    }),
    new Date(Date.UTC(2024, 0, 15)),
    "permitIssuedDate wins over approvedAt and today",
  );
  // 2. approvedAt wins over today.
  eq(
    resolvePermitIssueDate({
      approvedAt: "2026-04-28T15:30:00Z",
      now: fixedClock,
    }),
    new Date("2026-04-28T15:30:00Z"),
    "approvedAt wins over today when permitIssuedDate is missing",
  );
  // 3. Falls through to today when nothing is locked.
  eq(
    resolvePermitIssueDate({ now: fixedClock }),
    FIXED_NOW,
    "today wins when neither lock is set",
  );
  // 3b. null + undefined treated like missing.
  eq(
    resolvePermitIssueDate({
      permitIssuedDate: null,
      approvedAt: undefined,
      now: fixedClock,
    }),
    FIXED_NOW,
    "null permitIssuedDate + undefined approvedAt → today",
  );
});

group("date parsing variants", () => {
  // Date-only string normalises to UTC midnight.
  eq(
    resolvePermitIssueDate({
      permitIssuedDate: "2026-04-29",
      now: fixedClock,
    }),
    new Date(Date.UTC(2026, 3, 29)),
    "date-only YYYY-MM-DD → UTC midnight",
  );
  // ISO timestamp parsed verbatim.
  eq(
    resolvePermitIssueDate({
      permitIssuedDate: "2026-04-29T14:30:00Z",
      now: fixedClock,
    }),
    new Date("2026-04-29T14:30:00Z"),
    "ISO timestamp parsed verbatim",
  );
  // US date picker MM/DD/YYYY.
  eq(
    resolvePermitIssueDate({
      permitIssuedDate: "04/29/2026",
      now: fixedClock,
    }),
    new Date(Date.UTC(2026, 3, 29)),
    "US date MM/DD/YYYY → UTC midnight",
  );
  // Date instance passed through.
  const rawDate = new Date("2025-12-31T00:00:00Z");
  eq(
    resolvePermitIssueDate({ permitIssuedDate: rawDate, now: fixedClock }),
    rawDate,
    "Date instance passed through unchanged",
  );
  // Garbage falls through to next layer.
  eq(
    resolvePermitIssueDate({
      permitIssuedDate: "not-a-date",
      approvedAt: "2026-04-28T10:00:00Z",
      now: fixedClock,
    }),
    new Date("2026-04-28T10:00:00Z"),
    "garbage permitIssuedDate falls through to approvedAt",
  );
  // Empty string treated as missing.
  eq(
    resolvePermitIssueDate({
      permitIssuedDate: "",
      approvedAt: "   ",
      now: fixedClock,
    }),
    FIXED_NOW,
    "whitespace-only inputs fall through to today",
  );
  // Invalid Date instance treated as missing.
  eq(
    resolvePermitIssueDate({
      permitIssuedDate: new Date("invalid"),
      approvedAt: "2026-04-28T10:00:00Z",
      now: fixedClock,
    }),
    new Date("2026-04-28T10:00:00Z"),
    "invalid Date instance falls through to approvedAt",
  );
});

group("application-type agnosticism", () => {
  // The helper has no application_type input on purpose — same rule
  // applies to new / renewal / modification / transfer. These tests just
  // document that the rule does NOT branch on type.
  for (const stage of ["new", "renewal", "modification", "transfer"]) {
    eq(
      resolvePermitIssueDate({
        approvedAt: "2026-04-28T10:00:00Z",
        now: fixedClock,
      }),
      new Date("2026-04-28T10:00:00Z"),
      `${stage}: approvedAt locks the date regardless of type`,
    );
  }
});

group("transferee click delay invariant", () => {
  // The motivating bug: approver signs on day N, transferee clicks accept
  // on day N+30. Every render between day N and day N+30 — and every
  // render after day N+30 — must show day N. The helper has no input for
  // "click date" by design; it can never accidentally pick up that value.
  const approvalDay = "2026-04-29T08:00:00Z";
  // Simulate the resolver running on day N+30 (after the click) in
  // preview mode (no permit row yet).
  const dayPlus30 = () => new Date("2026-05-29T16:00:00Z");
  eq(
    resolvePermitIssueDate({
      approvedAt: approvalDay,
      now: dayPlus30,
    }),
    new Date(approvalDay),
    "preview 30 days after approval still shows the approval day",
  );
  // After the permit row is created (terms accepted), `permits.issued_date`
  // is itself the approval day, so priority 1 already gives the same value.
  eq(
    resolvePermitIssueDate({
      permitIssuedDate: "2026-04-29",
      approvedAt: approvalDay,
      now: dayPlus30,
    }),
    new Date(Date.UTC(2026, 3, 29)),
    "post-issuance: permits.issued_date pins the value regardless of approvedAt drift",
  );
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
