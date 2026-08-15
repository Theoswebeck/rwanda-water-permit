/**
 * Tests for the public permit pages' concession boundary + area cascades.
 *
 * The rule these lock in: once an assessor has adjusted the concession polygon
 * during the field assessment, THAT polygon is what the permit represents. The
 * applicant's submitted geometry (`applications.coordinates`) is never mutated —
 * it stays on the row as the record of what was requested — so the public
 * verification page and the printable annex map have to prefer the assessor
 * value at render time.
 *
 * Run: node --test scripts/test-permit-concession-source.mjs
 */

import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./ts-module-loader.mjs";

const { deriveConcessionPolygons, deriveConcessionAreaValue } = loadTsModule(
  "lib/permit/permit-display.ts"
);

/** A 14-point-ish applicant boundary on Lake Kivu, as stored by PostGIS. */
const APPLICANT_GEOMETRY = {
  type: "Polygon",
  coordinates: [
    [
      [28.9381, -2.3818],
      [28.9344, -2.3823],
      [28.9344, -2.3831],
      [28.9347, -2.3845],
      [28.9358, -2.3844],
      [28.9381, -2.3818],
    ],
  ],
};

/** The tighter boundary the assessor recorded in the field. */
const ASSESSOR_POINTS = [
  { latitude: -2.381869, longitude: 28.935096 },
  { latitude: -2.381875, longitude: 28.936351 },
  { latitude: -2.383183, longitude: 28.936282 },
  { latitude: -2.383149, longitude: 28.935036 },
];

function makePermit(overrides = {}) {
  return {
    source: "permits",
    permit_number: "RWB/WP/2026/0001",
    purpose: "fish_farming_lakes",
    application: {
      intended_activities: ["fish_farming_lakes"],
      internal_notes: null,
      coordinates: APPLICANT_GEOMETRY,
      ...(overrides.application ?? {}),
    },
    ...overrides,
  };
}

test("assessor polygon wins over the applicant geometry", () => {
  const polygons = deriveConcessionPolygons(makePermit(), {
    waterSourcePolygonPoints: ASSESSOR_POINTS,
  });

  assert.equal(polygons.length, 1);
  assert.equal(polygons[0].length, ASSESSOR_POINTS.length);
  assert.equal(Number(polygons[0][0].latitude), ASSESSOR_POINTS[0].latitude);
  assert.equal(Number(polygons[0][0].longitude), ASSESSOR_POINTS[0].longitude);
});

test("applicant geometry is used when the assessor made no adjustment", () => {
  const polygons = deriveConcessionPolygons(makePermit(), null);
  assert.equal(polygons.length, 1);
  assert.equal(Number(polygons[0][0].longitude), 28.9381);
});

test("string coordinates from the assessment form are accepted", () => {
  const polygons = deriveConcessionPolygons(makePermit(), {
    waterSourcePolygonPoints: ASSESSOR_POINTS.map((p) => ({
      latitude: String(p.latitude),
      longitude: String(p.longitude),
    })),
  });
  assert.equal(polygons[0].length, 4);
  assert.equal(Number(polygons[0][2].latitude), -2.383183);
});

test("a malformed or too-short assessor polygon falls back to the applicant geometry", () => {
  for (const bad of [
    { waterSourcePolygonPoints: [] },
    { waterSourcePolygonPoints: ASSESSOR_POINTS.slice(0, 2) },
    { waterSourcePolygonPoints: [{ latitude: "abc", longitude: "def" }] },
    { waterSourcePolygonPoints: "not-an-array" },
  ]) {
    const polygons = deriveConcessionPolygons(makePermit(), bad);
    assert.equal(polygons.length, 1, JSON.stringify(bad));
    assert.equal(Number(polygons[0][0].longitude), 28.9381, JSON.stringify(bad));
  }
});

test("non-concession permits still get no polygons", () => {
  const permit = makePermit({
    purpose: "irrigation",
    application: { intended_activities: ["irrigation"], internal_notes: null, coordinates: APPLICANT_GEOMETRY },
  });
  assert.deepEqual(deriveConcessionPolygons(permit, { waterSourcePolygonPoints: ASSESSOR_POINTS }), []);
});

test("internal_notes.waterSourcePolygons backs up a missing geometry column", () => {
  const permit = makePermit({
    application: {
      intended_activities: ["fish_farming_lakes"],
      internal_notes: JSON.stringify({ waterSourcePolygons: [ASSESSOR_POINTS] }),
      coordinates: null,
    },
  });
  const polygons = deriveConcessionPolygons(permit, null);
  assert.equal(polygons.length, 1);
  assert.equal(polygons[0].length, 4);
});

test("area is computed from the assessor polygon rather than the applicant's declared hectares", () => {
  const area = deriveConcessionAreaValue(
    makePermit({ application: { concession_area: 7.604, intended_activities: ["fish_farming_lakes"], internal_notes: null, coordinates: APPLICANT_GEOMETRY } }),
    null,
    { waterSourcePolygonPoints: ASSESSOR_POINTS }
  );

  // The assessor's 4-point box is ~2 ha — nowhere near the applicant's 7.604 ha.
  const hectares = Number(area.replace(/[^0-9.]/g, ""));
  assert.ok(area.endsWith(" ha"), `expected hectares, got ${area}`);
  assert.ok(hectares > 1 && hectares < 3, `expected ~2 ha from the assessor polygon, got ${area}`);
});

test("an explicit assessor-recommended area still outranks the polygon", () => {
  const area = deriveConcessionAreaValue(makePermit(), null, {
    recommendedVolumeM3: 2,
    waterSourcePolygonPoints: ASSESSOR_POINTS,
  });
  assert.equal(area, "2 ha");
});

test("without an assessor polygon the applicant's declared area is unchanged", () => {
  const area = deriveConcessionAreaValue(
    makePermit({ application: { concession_area: 7.604, intended_activities: ["fish_farming_lakes"], internal_notes: null, coordinates: APPLICANT_GEOMETRY } }),
    null,
    null
  );
  assert.equal(area, "7.604 ha");
});
