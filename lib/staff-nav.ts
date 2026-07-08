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

/**
 * Dashboard base path for a staff role (as used in a `?back=` return target).
 * Mirrors the role → panel mapping in `getInspectionBasePath`.
 */
export function staffDashboardBaseForRole(role: string | undefined): string {
  switch (role) {
    case "assessor":
      return "/assessment";
    case "verifier":
      return "/verification";
    case "approver":
      return "/approver";
    case "reviewer":
    case "admin":
    default:
      return "/review";
  }
}
