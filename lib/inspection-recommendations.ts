export const INSPECTION_RECOMMENDATION_OPTIONS = [
  "No action required",
  "Warning/Reminder",
  "Sanction",
] as const;

export type InspectionRecommendation =
  (typeof INSPECTION_RECOMMENDATION_OPTIONS)[number];

export function normalizeInspectionRecommendation(
  value?: string | null
): InspectionRecommendation | undefined {
  if (!value) return undefined;
  return INSPECTION_RECOMMENDATION_OPTIONS.find((option) => option === value);
}
