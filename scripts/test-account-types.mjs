import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const repoRoot = process.cwd();
const helperPath = path.join(repoRoot, "lib/auth/account-types.ts");
const profileFieldsPath = path.join(repoRoot, "lib/application/profile-locked-fields.ts");
const require = createRequire(import.meta.url);
const moduleCache = new Map();

function loadTypeScriptModule(filePath) {
  if (moduleCache.has(filePath)) return moduleCache.get(filePath);

  const source = fs.readFileSync(filePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });

  const module = { exports: {} };
  moduleCache.set(filePath, module.exports);
  const customRequire = (specifier) => {
    if (specifier.startsWith("@/")) {
      const mappedPath = path.join(repoRoot, `${specifier.slice(2)}.ts`);
      return loadTypeScriptModule(mappedPath);
    }
    if (specifier.startsWith(".")) {
      const mappedPath = path.join(path.dirname(filePath), `${specifier}.ts`);
      return loadTypeScriptModule(mappedPath);
    }
    return require(specifier);
  };

  vm.runInNewContext(compiled.outputText, {
    module,
    exports: module.exports,
    require: customRequire,
  });
  moduleCache.set(filePath, module.exports);
  return module.exports;
}

const accountTypes = loadTypeScriptModule(helperPath);
const profileFields = loadTypeScriptModule(profileFieldsPath);

test("preserves specific organisation account types during signup", () => {
  for (const accountType of ["company", "cooperative", "organization", "institution", "ngo_association"]) {
    assert.equal(accountTypes.normalizeSignupAccountType(accountType), accountType);
  }
});

test("rejects unsupported signup account types", () => {
  assert.equal(accountTypes.normalizeSignupAccountType("charity"), null);
  assert.equal(accountTypes.normalizeSignupAccountType(""), null);
  assert.equal(accountTypes.normalizeSignupAccountType(undefined), null);
});

test("profile-owned applicant category overrides stale saved application data", () => {
  const values = profileFields.applyLockedApplicantProfileFields(
    {
      fullNameApplicant: "COOPERATIVE TUHAGERE",
      categoryApplicant: "company",
    },
    {
      account_type: "cooperative",
      company_name: "COOPERATIVE TUHAGERE",
    }
  );

  assert.equal(values.fullNameApplicant, "COOPERATIVE TUHAGERE");
  assert.equal(values.categoryApplicant, "cooperative");
});
