import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const repoRoot = process.cwd();
const source = fs.readFileSync(path.join(repoRoot, "lib/safe-internal-path.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
new Function("exports", "module", compiled)(module.exports, module);
const { safeInternalPath } = module.exports;

test("accepts a normal internal path", () => {
  assert.equal(safeInternalPath("/review?tab=inspections"), "/review?tab=inspections");
  assert.equal(safeInternalPath("/assessment"), "/assessment");
});

test("rejects protocol-relative // (browser normalizes to external origin)", () => {
  assert.equal(safeInternalPath("//evil.com"), null);
});

test("rejects backslash protocol-relative /\\ (open-redirect bypass)", () => {
  // Browsers resolve "/\evil.com" to "//evil.com" -> http://evil.com/
  assert.equal(safeInternalPath("/\\evil.com"), null);
  assert.equal(safeInternalPath("/\\/evil.com"), null);
});

test("rejects absolute and non-slash values", () => {
  assert.equal(safeInternalPath("https://evil.com"), null);
  assert.equal(safeInternalPath("evil.com"), null);
  assert.equal(safeInternalPath(""), null);
  assert.equal(safeInternalPath(null), null);
  assert.equal(safeInternalPath(undefined), null);
});
