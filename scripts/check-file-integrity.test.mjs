#!/usr/bin/env node
/**
 * Self-check for the upload integrity checker's path handling.
 * Run: node scripts/check-file-integrity.test.mjs
 */
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileExists } from "./check-file-integrity.mjs";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "/uploads/__integrity_selfcheck__/probe.txt";
const ABS = path.join(APP_DIR, "public", REL.replace(/^\/+/, ""));

await mkdir(path.dirname(ABS), { recursive: true });
await writeFile(ABS, "probe");
assert.equal(await fileExists(REL), true, "existing file must be found");

await rm(ABS);
assert.equal(await fileExists(REL), false, "deleted file must be reported missing");
await rm(path.dirname(ABS), { recursive: true, force: true });

// A path that escapes public/ must never be stat'd as if it were an upload.
assert.equal(await fileExists("/uploads/../../../../etc/passwd"), false, "traversal must be refused");
assert.equal(await fileExists(""), false, "empty path must be refused");

console.log("check-file-integrity self-check passed");
