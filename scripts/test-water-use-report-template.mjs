import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const repoRoot = process.cwd();
const source = fs.readFileSync(
  path.join(repoRoot, "lib/water-use-report-utils.ts"),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
new Function("exports", "module", "require", compiled)(
  module.exports,
  module,
  () => ({}),
);
const { selectWaterUseReportTemplate, isConcessionActivity, CONCESSION_ACTIVITIES } =
  module.exports;

const pick = (permitPurpose, applicationIntendedActivities) =>
  selectWaterUseReportTemplate({ permitPurpose, applicationIntendedActivities });

test("regression: concession purpose wins even when activities omit it", () => {
  // 000018/RWB/2026 on production: purpose 'recreation' but activities
  // ["navigation"]. Resolving from activities alone gave 'abstraction'.
  assert.equal(pick("recreation", ["navigation"]), "concession");
});

test("concession activity is honoured when the purpose is absent or unrelated", () => {
  assert.equal(pick(null, ["fish_farming_lakes"]), "concession");
  assert.equal(pick("water_supply", ["port_construction"]), "concession");
});

test("every known concession activity resolves via either input", () => {
  for (const activity of CONCESSION_ACTIVITIES) {
    assert.equal(pick(activity, null), "concession", `purpose=${activity}`);
    assert.equal(pick(null, [activity]), "concession", `activity=${activity}`);
  }
});

test("abstraction activities stay on the abstraction template", () => {
  assert.equal(pick("water_supply", ["water_supply"]), "abstraction");
  assert.equal(pick("irrigation", ["irrigation", "livestock"]), "abstraction");
  assert.equal(pick("coffee_washing", null), "abstraction");
});

test("missing / empty inputs default to abstraction rather than throwing", () => {
  assert.equal(pick(null, null), "abstraction");
  assert.equal(pick(undefined, undefined), "abstraction");
  assert.equal(pick(null, []), "abstraction");
  assert.equal(pick("", [""]), "abstraction");
});

test("activity matching is case- and whitespace-insensitive", () => {
  assert.equal(pick("Recreation", null), "concession");
  assert.equal(pick(null, ["  Fish_Farming_Lakes  "]), "concession");
  assert.equal(isConcessionActivity("GAZ_EXTRACTION"), true);
  assert.equal(isConcessionActivity("navigation"), false);
  assert.equal(isConcessionActivity(null), false);
});

test("a non-array activities value does not throw", () => {
  assert.equal(pick(null, "fish_farming_lakes"), "abstraction");
});
