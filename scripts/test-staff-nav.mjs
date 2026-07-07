import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const repoRoot = process.cwd();
const source = fs.readFileSync(path.join(repoRoot, "lib/staff-nav.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
new Function("exports", "module", compiled)(module.exports, module);
const { staffListHref } = module.exports;

test("primary section returns the bare dashboard path", () => {
  assert.equal(staffListHref("review", "primary"), "/review");
  assert.equal(staffListHref("approver", "primary"), "/approver");
});

test("inspections section returns the inspections tab URL", () => {
  assert.equal(staffListHref("review", "inspections"), "/review?tab=inspections");
  assert.equal(staffListHref("verification", "inspections"), "/verification?tab=inspections");
});

test("water-reports section returns the water-reports tab URL", () => {
  assert.equal(staffListHref("assessment", "water-reports"), "/assessment?tab=water-reports");
});
