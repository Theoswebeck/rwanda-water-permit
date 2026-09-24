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

const RWB = "j.doe@rwb.rw";

test("RWB staff mailboxes are challenged", () => {
  for (const role of ["admin", "approver", "reviewer", "verifier", "assessor", "inspector", "ADMIN"]) {
    assert.equal(requiresTwoFactor(role, RWB), true, `${role} must be challenged`);
  }
  assert.equal(requiresTwoFactor("admin", "IT@Permits.RWB.RW"), true, "subdomain and case must still match");
});

test("applicants are exempt", () => {
  for (const role of ["applicant", "Applicant", "application", null, undefined, ""]) {
    assert.equal(requiresTwoFactor(role, RWB), false, `${role} must not be challenged`);
  }
});

test("staff roles on non-RWB mailboxes are exempt", () => {
  for (const email of ["someone@gmail.com", "staff@rwb.rw.attacker.com", "no-at-sign", "", null, undefined]) {
    assert.equal(requiresTwoFactor("admin", email), false, `${email} must not be challenged`);
  }
});
