/**
 * Offline builder for the catchment lookup data used by the public Water Use
 * Dashboard and by `lib/permit/catchment-resolution.ts`.
 *
 * It produces two committed artefacts:
 *
 *   lib/permit/data/catchment-boundaries.json  — simplified Level-I catchment
 *       polygons (9 official RWB catchments) used for point-in-polygon lookup
 *       when a registry row has coordinates.
 *
 *   lib/permit/data/catchment-admin-lookup.json — sector→catchment and
 *       district→catchment tables, computed by maximum area overlap. Used when
 *       a registry row has no usable coordinates and we only know its location
 *       text.
 *
 * Sources (both openly licensed, both re-downloadable):
 *   - Level-I catchments: RWB / SHER "Rwanda Level 1 Catchments" ArcGIS layer.
 *   - Administrative boundaries: geoBoundaries gbOpen RWA ADM2/ADM3
 *     (CC BY 4.0, sourced from NISR Open Data Rwanda).
 *
 * Run with:  node scripts/build-catchment-lookup.mjs
 *
 * This is a build-time script on purpose: the runtime must never depend on a
 * third-party service being reachable from the RWB on-prem server.
 */

import fs from "node:fs";
import path from "node:path";
import * as turf from "@turf/turf";

const CATCHMENT_URL =
  "https://services2.arcgis.com/y20RuA5nmE8htWdM/ArcGIS/rest/services/Rwanda_Level_1_Catchments/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
const ADM3_URL =
  "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/RWA/ADM3/geoBoundaries-RWA-ADM3.geojson";
const ADM2_URL =
  "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/RWA/ADM2/geoBoundaries-RWA-ADM2.geojson";

const OUT_DIR = path.join(process.cwd(), "lib/permit/data");

/**
 * Level-I codes we accept. The ArcGIS layer also carries an "NKIR" feature with
 * no name, which is not one of the nine official Level-I catchments in
 * `lib/rwanda-catchments.ts` — it is dropped so the dashboard can never invent
 * a tenth catchment.
 */
const OFFICIAL_CODES = new Set([
  "CKIV",
  "CRUS",
  "NNYU",
  "NMUK",
  "NNYL",
  "NAKN",
  "NAKU",
  "NAKL",
  "NMUV",
]);

async function fetchJson(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Largest-overlap catchment code for an administrative polygon. */
function dominantCatchment(adminFeature, catchments) {
  let best = null;
  let bestArea = 0;
  for (const c of catchments) {
    let intersection;
    try {
      intersection = turf.intersect(
        turf.featureCollection([adminFeature, c.feature])
      );
    } catch {
      intersection = null;
    }
    if (!intersection) continue;
    const area = turf.area(intersection);
    if (area > bestArea) {
      bestArea = area;
      best = c.code;
    }
  }
  const adminArea = turf.area(adminFeature);
  const share = adminArea > 0 ? bestArea / adminArea : 0;
  return { code: best, share };
}

async function main() {
  console.log("Downloading source datasets…");
  const [rawCatchments, adm3, adm2] = await Promise.all([
    fetchJson(CATCHMENT_URL),
    fetchJson(ADM3_URL),
    fetchJson(ADM2_URL),
  ]);

  const catchments = rawCatchments.features
    .map((f) => ({
      code: String(f.properties?.Catchments_NB1_L1 || "").toUpperCase(),
      feature: f,
    }))
    .filter((c) => OFFICIAL_CODES.has(c.code));

  if (catchments.length !== OFFICIAL_CODES.size) {
    throw new Error(
      `Expected ${OFFICIAL_CODES.size} official catchments, got ${catchments.length}`
    );
  }

  // --- 1. Simplified boundaries for runtime point-in-polygon ----------------
  // 0.001° ≈ 110 m. Well inside the precision of the registry's coordinates,
  // and it keeps the committed file small enough to import at runtime.
  const boundaries = {
    type: "FeatureCollection",
    features: catchments.map((c) => {
      const simplified = turf.simplify(c.feature, {
        tolerance: 0.001,
        highQuality: true,
        mutate: false,
      });
      return {
        type: "Feature",
        properties: { code: c.code },
        geometry: simplified.geometry,
      };
    }),
  };

  // --- 2. Sector and district lookups --------------------------------------
  console.log("Computing district → catchment overlaps…");
  const districtLookup = {};
  const districtFeatures = [];
  for (const f of adm2.features) {
    const name = f.properties?.shapeName;
    const { code, share } = dominantCatchment(f, catchments);
    if (!code) continue;
    districtLookup[normalizeName(name)] = { code, share: Number(share.toFixed(4)) };
    districtFeatures.push({ name, feature: f });
    console.log(
      `  ${String(name).padEnd(12)} → ${code} (${Math.round(share * 100)}% of district area)`
    );
  }

  console.log("Computing sector → catchment overlaps…");
  const sectorLookup = {};
  for (const f of adm3.features) {
    const sectorName = f.properties?.shapeName;
    const { code, share } = dominantCatchment(f, catchments);
    if (!code) continue;

    // Attribute the sector to its parent district so that sector names that
    // repeat across districts (there are 30 such names) stay unambiguous.
    let parent = null;
    let parentArea = 0;
    const centroid = turf.centroid(f);
    for (const d of districtFeatures) {
      if (turf.booleanPointInPolygon(centroid, d.feature)) {
        parent = d.name;
        break;
      }
      let inter;
      try {
        inter = turf.intersect(turf.featureCollection([f, d.feature]));
      } catch {
        inter = null;
      }
      if (!inter) continue;
      const a = turf.area(inter);
      if (a > parentArea) {
        parentArea = a;
        parent = d.name;
      }
    }
    if (!parent) continue;
    sectorLookup[`${normalizeName(parent)}|${normalizeName(sectorName)}`] = {
      code,
      share: Number(share.toFixed(4)),
    };
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "catchment-boundaries.json"),
    JSON.stringify(boundaries)
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "catchment-admin-lookup.json"),
    JSON.stringify({ districts: districtLookup, sectors: sectorLookup }, null, 2)
  );

  console.log(
    `\nWrote ${catchments.length} catchment polygons, ` +
      `${Object.keys(districtLookup).length} districts, ` +
      `${Object.keys(sectorLookup).length} sectors to ${OUT_DIR}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
