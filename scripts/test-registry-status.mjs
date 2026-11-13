/**
 * Registry row status is derived from the expiration date unless it is an
 * explicit override (suspended / revoked / cancelled).
 *
 * Run: node --test scripts/test-registry-status.mjs
 */

import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./ts-module-loader.mjs";

const { deriveRegistryStatus } = loadTsModule("lib/permit/registry-status.ts");
const now = new Date(2026, 9, 1); // 2026-10-01 local

test("past expiry is EXPIRED, today or later is OPERATIONAL", () => {
  assert.equal(deriveRegistryStatus("OPERATIONAL", "2026-09-30", now), "EXPIRED");
  assert.equal(deriveRegistryStatus("EXPIRED", "2026-10-01", now), "OPERATIONAL");
  assert.equal(deriveRegistryStatus("EXPIRED", "2030-01-01", now), "OPERATIONAL");
  assert.equal(deriveRegistryStatus(null, null, now), "OPERATIONAL");
  assert.equal(deriveRegistryStatus("RENEWED", "2020-01-01", now), "EXPIRED");
});

test("overrides win over the date", () => {
  assert.equal(deriveRegistryStatus("suspended", "2030-01-01", now), "SUSPENDED");
  assert.equal(deriveRegistryStatus("Revoked", "2020-01-01", now), "REVOKED");
  assert.equal(deriveRegistryStatus("CANCELLED BY RWB", "2030-01-01", now), "CANCELLED");
});
