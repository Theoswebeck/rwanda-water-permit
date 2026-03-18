export const INSPECTION_RECOMMENDATION_OPTIONS = [
  "No action required",
  "Warning/Reminder",
  "Permit Cancellation",
  "Permit Suspension",
  "Fines",
  "Any other",
] as const;

export const RECOMMENDATION_DETAIL_HINTS: Record<string, string> = {
  "No action required": "Provide additional details if needed...",
  "Warning/Reminder": "Describe the warning or reminder details...",
  "Permit Cancellation": "Explain the grounds for cancellation...",
  "Permit Suspension": "Specify the suspension duration and conditions...",
  "Fines": "Specify the fine amount and basis...",
  "Any other": "Specify the recommendation and details...",
};

export type InspectionRecommendation =
  (typeof INSPECTION_RECOMMENDATION_OPTIONS)[number];

export function normalizeInspectionRecommendation(
  value?: string | null
): InspectionRecommendation | undefined {
  if (!value) return undefined;
  const match = INSPECTION_RECOMMENDATION_OPTIONS.find((option) => option === value);
  if (match) return match;
  if (value === "Sanction") return "Fines";
  return undefined;
}
