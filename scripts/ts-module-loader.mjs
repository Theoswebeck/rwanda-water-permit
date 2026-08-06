/**
 * Minimal TypeScript module loader for `node --test` scripts.
 *
 * The repo has no test runner that understands TS, so tests transpile the
 * modules they exercise on the fly (same approach as
 * `scripts/test-account-types.mjs`, generalised so several test files can share
 * it). Supports relative imports, `@/` path aliases, and JSON imports.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
const cache = new Map();

function loadJson(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  // Mimic esModuleInterop: transpiled code reads `.default`. The property is
  // non-enumerable so `Object.keys()` on the module still sees only real data.
  const wrapper = Array.isArray(parsed)
    ? Object.assign([], parsed)
    : Object.assign({}, parsed);
  Object.defineProperty(wrapper, "default", {
    value: parsed,
    enumerable: false,
  });
  return wrapper;
}

function resolveFile(basePath) {
  for (const candidate of [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.json`, path.join(basePath, "index.ts")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export function loadTsModule(filePath, repoRoot = process.cwd()) {
  const resolved = resolveFile(path.resolve(repoRoot, filePath));
  if (!resolved) throw new Error(`Cannot resolve module: ${filePath}`);
  if (cache.has(resolved)) return cache.get(resolved);

  if (resolved.endsWith(".json")) {
    const value = loadJson(resolved);
    cache.set(resolved, value);
    return value;
  }

  const source = fs.readFileSync(resolved, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  });

  const module = { exports: {} };
  cache.set(resolved, module.exports);

  const customRequire = (specifier) => {
    if (specifier.startsWith("@/")) {
      return loadTsModule(specifier.slice(2), repoRoot);
    }
    if (specifier.startsWith(".")) {
      return loadTsModule(path.resolve(path.dirname(resolved), specifier), repoRoot);
    }
    return nodeRequire(specifier);
  };

  new Function("module", "exports", "require", compiled.outputText)(
    module,
    module.exports,
    customRequire
  );

  cache.set(resolved, module.exports);
  return module.exports;
}
