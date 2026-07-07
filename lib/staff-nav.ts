export type StaffPanel = "review" | "assessment" | "approver" | "verification";
export type ListSection = "primary" | "inspections" | "water-reports";

/**
 * Canonical URL of the dashboard list a staff detail page should return to.
 * `primary` = the panel's default tab (loads with no ?tab= param).
 */
export function staffListHref(panel: StaffPanel, section: ListSection): string {
  if (section === "primary") return `/${panel}`;
  return `/${panel}?tab=${section}`;
}
