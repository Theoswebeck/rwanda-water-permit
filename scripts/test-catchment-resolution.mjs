/**
 * Tests for district and catchment resolution of Permit Registry rows.
 *
 * Fixtures are real `location`, `latitude` and `longitude` values from the
 * production registry, including the malformed ones (misspelled districts,
 * sector-only strings, and coordinates that plot outside Rwanda).
 *
 * Run: node --test scripts/test-catchment-resolution.mjs
 */

import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./ts-module-loader.mjs";

const {
  resolveDistrictFromLocation,
  resolveCatchment,
  catchmentCodeForCoordinates,
  catchmentLabelForCode,
  allCatchmentCodes,
  getAllDistricts,
} = loadTsModule("lib/permit/catchment-resolution.ts");

test("exact district names are read out of free-text locations", () => {
  const cases = [
    [
      "Nyungwe buffer zone: Southern Provence,  Nyamagabe District, Uwinkingi Sector, Rugogwe Cell",
      "Nyamagabe",
    ],
    ["Northern Provence, Gicumbi District, Bukure Sector, Kivumu cell", "Gicumbi"],
    ["Eastern Province, Rwamagana District, Karenge Sector", "Rwamagana"],
    ["Gicumbi District", "Gicumbi"],
  ];
  for (const [location, expected] of cases) {
    assert.equal(resolveDistrictFromLocation(location).district, expected, location);
  }
});

test("misspelled district names still resolve, unambiguously", () => {
  // "Nyamsheke" / "Nyamesheke" both appear in the production registry.
  assert.equal(
    resolveDistrictFromLocation(
      "Western Province, Nyamsheke District, Nyabitekeri Sector, Mariba Cell"
    ).district,
    "Nyamasheke"
  );
  assert.equal(
    resolveDistrictFromLocation("Cyato Sector, Nyamesheke District in Western Province").district,
    "Nyamasheke"
  );
});

test("a sector name resolves the district when no district is named", () => {
  // Mutuntu is a Karongi sector and appears in no other district.
  const resolved = resolveDistrictFromLocation("Taba village, Gisayura cell, Mutuntu Sector");
  assert.equal(resolved.district, "Karongi");
  assert.equal(resolved.sector, "mutuntu");
});

test("ambiguous or empty locations resolve to nothing rather than guessing", () => {
  // "Murundi" is a sector name in more than one district.
  assert.equal(
    resolveDistrictFromLocation("Gitwa Village, Bukiro Cell, Murundi Sector").district,
    null
  );
  assert.equal(resolveDistrictFromLocation("").district, null);
  assert.equal(resolveDistrictFromLocation(null).district, null);
  assert.equal(resolveDistrictFromLocation("   ").district, null);
});

test("coordinates inside Rwanda resolve to the right catchment", () => {
  // Rubavu, on Lake Kivu.
  assert.equal(catchmentCodeForCoordinates(-1.6777, 29.2661), "CKIV");
  // Kigali city centre — Lower Nyabarongo.
  assert.equal(catchmentCodeForCoordinates(-1.9536, 30.0606), "NNYL");
});

test("coordinates outside Rwanda are rejected instead of misplaced", () => {
  // Real registry rows: latitude 1.9 (northern hemisphere) and a point in Uganda.
  assert.equal(catchmentCodeForCoordinates(1.900689, 30.428608), null);
  assert.equal(catchmentCodeForCoordinates(-1.100082, 30.307032), null);
  assert.equal(catchmentCodeForCoordinates(null, null), null);
  assert.equal(catchmentCodeForCoordinates(NaN, 30), null);
});

test("the cascade prefers coordinates, then sector, then district", () => {
  const byCoordinates = resolveCatchment({
    latitude: -1.6777,
    longitude: 29.2661,
    location: "Western Province, Rubavu District",
  });
  assert.equal(byCoordinates.source, "coordinates");
  assert.equal(byCoordinates.code, "CKIV");

  const bySector = resolveCatchment({
    latitude: null,
    longitude: null,
    location: "Northern Provence, Gicumbi District, Bukure Sector, Kivumu cell",
  });
  assert.equal(bySector.source, "sector");
  assert.equal(bySector.district, "Gicumbi");

  const byDistrict = resolveCatchment({
    latitude: null,
    longitude: null,
    location: "Rulindo District",
  });
  assert.equal(byDistrict.source, "district");
  assert.equal(byDistrict.code, "NNYL");
});

test("split districts are reported as unattributed rather than guessed", () => {
  // Gicumbi is ~55% Muvumba / ~45% Lower Nyabarongo. A permit that names only
  // the district must not be attributed to either.
  const resolved = resolveCatchment({ latitude: null, longitude: null, location: "Gicumbi District" });
  assert.equal(resolved.district, "Gicumbi");
  assert.equal(resolved.source, "unresolved");
  assert.equal(resolved.code, null);
});

test("a district whose own name is also a sector still goes through the district guard", () => {
  // 21 districts have a same-named sector (Kicukiro Sector in Kicukiro District,
  // Huye Sector in Huye District, …). Reading "Kicukiro District" as a sector
  // would take the sector branch and skip the district confidence threshold.
  const kicukiro = resolveCatchment({ latitude: null, longitude: null, location: "Kicukiro District" });
  assert.equal(kicukiro.source, "district");
  assert.equal(kicukiro.code, "NAKU");

  // These districts are all below the 70% threshold, so they must stay unattributed.
  for (const district of ["Huye", "Nyagatare", "Kirehe", "Gakenke"]) {
    const resolved = resolveCatchment({
      latitude: null,
      longitude: null,
      location: `${district} District`,
    });
    assert.equal(resolved.district, district);
    assert.equal(resolved.source, "unresolved", `${district} should not be attributed`);
  }
});

test("a token labelled Sector is never read as the district", () => {
  // "Ngoma" is both a district and a sector of Huye.
  const resolved = resolveDistrictFromLocation("Ngoma Sector, Huye");
  assert.equal(resolved.district, "Huye");
  assert.equal(resolved.sector, "ngoma");

  // "Kigali" is a province and a Nyarugenge sector, but never a district.
  assert.equal(resolveDistrictFromLocation("Kigali").district, null);
  assert.equal(resolveDistrictFromLocation("Kicukiro, Kigali").district, "Kicukiro");
});

test("catchment codes and labels match the official RWB list", () => {
  const codes = allCatchmentCodes();
  assert.equal(codes.length, 9);
  assert.deepEqual(
    [...codes].sort(),
    ["CKIV", "CRUS", "NAKL", "NAKN", "NAKU", "NMUK", "NMUV", "NNYL", "NNYU"]
  );
  assert.equal(catchmentLabelForCode("CKIV"), "Lake Kivu (CKIV)");
  assert.equal(catchmentLabelForCode(null), null);
});

test("all 30 districts are known", () => {
  const districts = getAllDistricts();
  assert.equal(districts.length, 30);
  assert.ok(districts.includes("Nyamasheke"));
  assert.ok(districts.includes("Kicukiro"));
});
