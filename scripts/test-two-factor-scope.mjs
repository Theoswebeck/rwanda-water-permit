/**
 * The one rule that must not drift: staff get a second factor, applicants
 * don't. Loads lib/auth/two-factor.ts with its DB and SMTP imports stubbed,
 * because only the pure role check is under test.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(path.join(process.cwd(), "lib/auth/two-factor.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const module = { exports: {} };
vm.runInNewContext(compiled, {
  module,
  exports: module.exports,
  process: { env: {} },
  // Nothing here is called by the role check; the stubs only satisfy the imports.
  require: () => new Proxy({}, { get: () => () => undefined }),
});
const { requiresTwoFactor } = module.exports;

test("RWB staff roles require a second factor", () => {
  for (const role of ["admin", "approver", "reviewer", "verifier", "assessor", "inspector", "ADMIN"]) {
    assert.equal(requiresTwoFactor(role), true, `${role} must be challenged`);
  }
});

test("applicants are exempt", () => {
  for (const role of ["applicant", "Applicant", "application", null, undefined, ""]) {
    assert.equal(requiresTwoFactor(role), false, `${role} must not be challenged`);
  }
});
