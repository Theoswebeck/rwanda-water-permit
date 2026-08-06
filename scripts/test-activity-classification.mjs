/**
 * Tests for the Permit Registry activity classifier.
 *
 * The fixtures are real strings taken from the production `permit_registry`
 * table (122 distinct values across 1,318 rows), including the messy ones —
 * typos, unit suffixes, and the "company water permit application for X"
 * pattern that system-issued permits produce.
 *
 * Run: node --test scripts/test-activity-classification.mjs
 */

import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./ts-module-loader.mjs";

const {
  classifyActivity,
  getActivityCategoryLabel,
  activityCodeSqlExpression,
  activityFilterOptions,
  ACTIVITY_CATEGORY_CODES,
  ACTIVITY_NOT_SPECIFIED,
  ACTIVITY_OTHER,
} = loadTsModule("lib/permit/activity-classification.ts");

/** [raw registry value, expected canonical code] */
const CASES = [
  // --- the high-volume values ------------------------------------------------
  ["water supply", "water_supply"],
  ["Water supply", "water_supply"],
  ["Water Supply", "water_supply"],
  ["Domestic water supply", "water_supply"],
  ["domestic purpose", "water_supply"],
  ["Domestic Purpose", "water_supply"],
  ["Domestic water use", "water_supply"],
  ["Public Water supply", "water_supply"],
  ["Commercial water supply", "water_supply"],
  ["Irrigation", "irrigation"],
  ["irrigation", "irrigation"],
  ["Irrigation of 10Ha", "irrigation"],
  ["Irrigation (824 ha)", "irrigation"],
  ["Irrigation (16,000 ha): Gabiro Commercial Farming Project", "irrigation"],
  ["irrigation activities", "irrigation"],
  ["Coffee washing station", "coffee_washing"],
  ["Coffee Washing Station", "coffee_washing"],
  ["coffee washing station", "coffee_washing"],
  ["Coffee Wahing Station", "coffee_washing"],
  ["coffe washing Activities", "coffee_washing"],
  ["CWS", "coffee_washing"],
  ["Mining", "mining"],
  ["Mining activities", "mining"],
  ["Mining (Aggregate stones)", "mining"],
  ["Mining and quarrying", "mining"],
  ["core drilling-based mining", "mining"],
  ["Mineral washing", "mining"],
  ["Washing mineral ores", "mining"],
  ["Fish Farming", "fish_farming"],
  ["Fish farming in ponds", "fish_farming"],
  ["Fish farming in cages", "fish_farming"],
  ["Aquaculture using cages", "fish_farming"],
  ["Aquacultureusing cages", "fish_farming"],
  ["Fish hatchery", "fish_farming"],
  ["Hydropower", "electricity_generation"],
  ["hydropower", "electricity_generation"],
  ["Electricity generation", "electricity_generation"],
  ["Power production", "electricity_generation"],
  ["Power generation", "electricity_generation"],
  ["Construction of Hydropower", "electricity_generation"],
  ["Industrial", "industrial"],
  ["Industry", "industrial"],
  ["Industrial use", "industrial"],
  ["Tea processing", "industrial"],
  ["Manufacturing of dairy products", "industrial"],
  ["Recreation", "recreation"],
  ["Recreational", "recreation"],
  ["Recreational activities", "recreation"],
  ["Hotel activities", "recreation"],
  ["Livestock watering", "livestock"],
  ["Livestock water supply", "livestock"],
  ["Navigation", "navigation"],
  ["Boat testing", "navigation"],
  ["Port", "port_construction"],
  ["Dam construction", "construction_of_dam"],
  ["Gas Extraction", "gaz_extraction"],
  ["Natural Gas Extraction and Processing activities", "gaz_extraction"],
  ["Construction processes of New Bugesera International Airport", "construction_of_infrastructures"],

  // --- orderings that are easy to get wrong ---------------------------------
  // "mineral" must not win over bottling
  ["Bottled Mineral water", "industrial"],
  ["Package bottle water plant", "industrial"],
  ["Water Bottling Business", "industrial"],
  // the primary activity wins over qualifiers in parentheses / after "and"
  ["Industrial (processing wooden electricity pole) and ancillary uses", "industrial"],
  ["Industrial (tea processing) & residential", "industrial"],
  ["Industrial use, Electricity generation and other general use on power plant site", "industrial"],
  ["Industrial uses/ Abattoir", "industrial"],
  ["Domestic, Industrial", "water_supply"],
  ["Irrigation/domestic water supply", "irrigation"],
  ["Irrigation&chicken rearing", "irrigation"],
  ["Hatchery and domestic water supply", "fish_farming"],
  ["Potable services and construction activities", "water_supply"],
  ["domestic purpose in Sovu homes, guest house and health center", "water_supply"],
  // irrigation beats recreation, recreation beats fish farming
  ["Irrigating the golf course", "irrigation"],
  ["Recreational fishing", "recreation"],

  // --- system-issued permits (project_description) ---------------------------
  ["company water permit application for irrigation", "irrigation"],
  ["company water permit application for water_supply", "water_supply"],
  ["company water permit application for coffee_washing", "coffee_washing"],
  ["company water permit application for mining", "mining"],
  ["company water permit application for industry", "industrial"],
  ["company water permit application for fish_farming_ponds", "fish_farming"],
  ["individual water permit application for irrigation", "irrigation"],
  ["ngo_association water permit application for irrigation", "irrigation"],
  ["cooperative water permit application for mining", "mining"],
  ["fish_farming_lakes", "fish_farming"],

  // --- blanks ----------------------------------------------------------------
  ["", ACTIVITY_NOT_SPECIFIED],
  ["   ", ACTIVITY_NOT_SPECIFIED],
  [null, ACTIVITY_NOT_SPECIFIED],
  [undefined, ACTIVITY_NOT_SPECIFIED],
];

test("classifies every known registry activity value", () => {
  for (const [raw, expected] of CASES) {
    assert.equal(
      classifyActivity(raw),
      expected,
      `${JSON.stringify(raw)} should classify as ${expected}`
    );
  }
});

test("only genuinely vague values fall through to Other", () => {
  // These two are the only values in the production registry with no usable
  // signal; if a future import adds more, that is worth noticing.
  assert.equal(classifyActivity("Company's activities"), ACTIVITY_OTHER);
  assert.equal(classifyActivity("Groundwater investigation"), ACTIVITY_OTHER);
});

test("every produced code has a label and appears in the dropdown", () => {
  const dropdown = activityFilterOptions();
  const dropdownValues = new Set(dropdown.map((o) => o.value));

  for (const [raw] of CASES) {
    const code = classifyActivity(raw);
    assert.ok(ACTIVITY_CATEGORY_CODES.includes(code), `${code} is not a canonical code`);
    assert.ok(dropdownValues.has(code), `${code} is missing from the Activity dropdown`);
    const label = getActivityCategoryLabel(code);
    assert.ok(label && label.length > 0, `${code} has no label`);
  }

  assert.equal(dropdown.length, ACTIVITY_CATEGORY_CODES.length);
});

test("SQL expression covers the same rules as the TypeScript classifier", () => {
  const sql = activityCodeSqlExpression("pr.authorized_activity");

  // Every canonical code that a rule can produce must appear as a THEN branch.
  const ruleProducedCodes = new Set(CASES.map(([raw]) => classifyActivity(raw)));
  for (const code of ruleProducedCodes) {
    if (code === ACTIVITY_NOT_SPECIFIED) {
      assert.match(sql, /THEN 'not_specified'/);
      continue;
    }
    assert.ok(sql.includes(`THEN '${code}'`), `SQL has no branch producing '${code}'`);
  }

  // Two passes (primary segment, then whole string) plus the empty and ELSE cases.
  assert.ok(sql.startsWith("CASE"));
  assert.match(sql, /ELSE 'other'\s+END$/);
  // No unescaped single quotes could break out of a literal.
  const literals = sql.match(/'(?:[^']|'')*'/g) ?? [];
  assert.ok(literals.length > 0);
  assert.equal(
    sql.split("'").length % 2,
    1,
    "unbalanced quotes in the generated SQL expression"
  );
});
