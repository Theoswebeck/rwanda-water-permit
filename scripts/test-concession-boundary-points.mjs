/**
 * Tests for the assessment form's concession boundary point helpers.
 *
 * The bug these lock out: the assessor's polygon prefill can arrive with empty
 * point rows (the form renders a fixed set of slots). The save handler used to
 * reject the whole array if ANY point failed to parse, so a single untouched
 * blank row made the boundary permanently unsaveable.
 *
 * Run: node --test scripts/test-concession-boundary-points.mjs
 */

import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./ts-module-loader.mjs";

const { compactBoundaryPoints, isBlankPoint, parseBoundaryPoints, countUnparseablePoints } =
  loadTsModule("lib/permit/concession-boundary-points.ts");

test("a row is blank only when both boxes are empty", () => {
  assert.equal(isBlankPoint({ latitude: "", longitude: "" }), true);
  assert.equal(isBlankPoint({ latitude: "   ", longitude: "" }), true);
  assert.equal(isBlankPoint(undefined), true);
  assert.equal(isBlankPoint({ latitude: "-2.3818", longitude: "" }), false);
  assert.equal(isBlankPoint({ latitude: "-2.3818", longitude: "28.9381" }), false);
});

test("trailing blank rows are dropped, filled rows kept in order", () => {
  const points = [
    { latitude: "-2.381869", longitude: "28.935096" },
    { latitude: "-2.381875", longitude: "28.936351" },
    { latitude: "-2.383183", longitude: "28.936282" },
    { latitude: "-2.383149", longitude: "28.935036" },
    { latitude: "", longitude: "" },
    { latitude: "", longitude: "" },
    { latitude: "", longitude: "" },
  ];
  const compacted = compactBoundaryPoints(points);
  assert.equal(compacted.length, 4);
  assert.equal(compacted[0].latitude, "-2.381869");
  assert.equal(compacted[3].longitude, "28.935036");
});

test("a half-filled row survives compaction so it can be flagged, not silently dropped", () => {
  const compacted = compactBoundaryPoints([
    { latitude: "-2.3818", longitude: "28.9381" },
    { latitude: "-2.3823", longitude: "" },
    { latitude: "", longitude: "" },
  ]);
  assert.equal(compacted.length, 2);
});

test("compaction tolerates an empty or missing list", () => {
  assert.deepEqual(compactBoundaryPoints([]), []);
  assert.deepEqual(compactBoundaryPoints(undefined), []);
});

test("parsing keeps only rows that are a complete numeric pair", () => {
  const parsed = parseBoundaryPoints([
    { latitude: "-2.381869", longitude: "28.935096" },
    { latitude: " -2.381875 ", longitude: " 28.936351 " },
    { latitude: "-2.3831", longitude: "" },
    { latitude: "abc", longitude: "28.9350" },
    { latitude: "", longitude: "" },
  ]);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[1], { latitude: -2.381875, longitude: 28.936351 });
});

test("unparseable filled rows are counted so the assessor can be warned", () => {
  assert.equal(
    countUnparseablePoints([
      { latitude: "-2.3818", longitude: "28.9381" },
      { latitude: "-2.3823", longitude: "" },
      { latitude: "oops", longitude: "28.9344" },
      { latitude: "", longitude: "" },
    ]),
    2
  );
  assert.equal(countUnparseablePoints([{ latitude: "-2.3818", longitude: "28.9381" }]), 0);
});
