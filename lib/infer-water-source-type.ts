/**
 * Legacy applications (saved before "10. Source of Water" was required) hold
 * waterSourceType = "" in internal_notes, so Submit/Resubmit failed on the
 * Water Source tab forever (RWB-2026-000118, -000043). Fill it only when the
 * answer is unambiguous; otherwise return "" and the form asks the applicant.
 */
const VALID = new Set(["lake", "dam", "spring", "borehole", "stream_river", "other"]);
const LAKE_ONLY_ACTIVITIES = new Set(["port_construction", "gaz_extraction", "fish_farming_lakes"]);
// Rwanda's named lakes; a source named after one of these is a lake.
const LAKE_NAME = /\b(lake|kivu|muhazi|burera|ruhondo|ihema|cyohoha|mugesera|rweru|sake|bulera|nasho|rwampanga|kilimbi)\b/i;

export function inferWaterSourceType(input: {
  current?: unknown;
  waterSourceColumn?: string | null;
  sourceName?: string | null;
  activities?: unknown;
}): string {
  const current = String(input.current ?? "").trim();
  if (current) return current;
  const col = String(input.waterSourceColumn ?? "").trim();
  if (VALID.has(col)) return col;
  if (col === "groundwater") return "borehole";
  const acts = Array.isArray(input.activities) ? input.activities.map(String) : [];
  if (acts.some((a) => LAKE_ONLY_ACTIVITIES.has(a))) return "lake";
  if (LAKE_NAME.test(String(input.sourceName ?? ""))) return "lake";
  return "";
}
