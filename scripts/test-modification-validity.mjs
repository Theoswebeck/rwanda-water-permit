import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const repoRoot = process.cwd();
const source = fs.readFileSync(
  path.join(repoRoot, "lib/permit/resolve-modification-validity.ts"),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
new Function("exports", "module", compiled)(module.exports, module);
const { resolveModificationValidity, parsePermitDate } = module.exports;

const iso = (d) => (d ? d.toISOString().slice(0, 10) : null);

test("preserves the original permit's expiry from the first (linked) source", () => {
  const r = resolveModificationValidity([
    { issued: "2023-06-15", expiry: "2028-06-14" }, // linked public.permits
    { issued: "2020-01-01", expiry: "2025-01-01" }, // registry snapshot (should be ignored)
  ]);
  assert.equal(iso(r.issuedDate), "2023-06-15");
  assert.equal(iso(r.expiryDate), "2028-06-14");
});

test("resolves issued and expiry independently, keeping the highest-priority value for each", () => {
  // Linked row has the issue date but no expiry; registry snapshot has the
  // expiry. We keep the linked issue date AND the registry expiry.
  const r = resolveModificationValidity([
    { issued: "2023-06-15", expiry: null }, // linked lookup missed expiry
    { issued: "2021-03-01", expiry: "2026-02-28" }, // permit_registry
  ]);
  assert.equal(iso(r.issuedDate), "2023-06-15"); // NOT discarded
  assert.equal(iso(r.expiryDate), "2026-02-28");
});

test("uses a later source's issued date when earlier sources lack one", () => {
  const r = resolveModificationValidity([
    { issued: null, expiry: "2028-06-14" }, // expiry only
    { issued: "2023-06-15", expiry: "2028-06-14" }, // issued available here
  ]);
  assert.equal(iso(r.issuedDate), "2023-06-15");
  assert.equal(iso(r.expiryDate), "2028-06-14");
});

test("returns the expiry even when its source has no issued date", () => {
  const r = resolveModificationValidity([{ issued: null, expiry: "2027-12-31" }]);
  assert.equal(r.issuedDate, null);
  assert.equal(iso(r.expiryDate), "2027-12-31");
});

test("expiry is null when no source carries one, so the caller falls back", () => {
  const r = resolveModificationValidity([
    { issued: "2023-06-15", expiry: null },
    { issued: null, expiry: undefined },
  ]);
  // issued is still surfaced (not discarded); only expiry drives the fallback.
  assert.equal(iso(r.issuedDate), "2023-06-15");
  assert.equal(r.expiryDate, null);
});

test("never recomputes: a duration is not a source, so no drift from today", () => {
  // Only invalid/empty date sources -> null, forcing caller to a deliberate fallback
  const r = resolveModificationValidity([{ issued: "not-a-date", expiry: "garbage" }]);
  assert.equal(r.expiryDate, null);
});

test("parsePermitDate handles ISO date-only, US MM/DD/YYYY, and Date instances", () => {
  assert.equal(iso(parsePermitDate("2024-02-29")), "2024-02-29");
  assert.equal(iso(parsePermitDate("02/29/2024")), "2024-02-29");
  assert.equal(iso(parsePermitDate(new Date("2024-02-29T00:00:00Z"))), "2024-02-29");
  assert.equal(parsePermitDate(""), null);
  assert.equal(parsePermitDate(null), null);
});

test("parsePermitDate parses ISO timestamp strings (the string fallback path)", () => {
  // Exercises the `new Date(trimmed)` branch, not the instanceof branch.
  assert.equal(iso(parsePermitDate("2028-06-14T00:00:00Z")), "2028-06-14");
  assert.equal(iso(parsePermitDate("2028-06-14T00:00:00.000Z")), "2028-06-14");
  assert.equal(parsePermitDate("just text, no year"), null);
});
