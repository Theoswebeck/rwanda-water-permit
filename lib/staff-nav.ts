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
 * Where a "Back to Dashboard" control should land for a given role.
 *
 * Distinct from `staffDashboardBaseForRole`, which maps a role onto an
 * *inspection* panel and deliberately sends admins to the reviewer queue.
 * A home destination must be the role's own dashboard: admins who opened an
 * application from /admin were being returned to /dashboard — the applicant
 * dashboard — which lists only their own applications and so read "no
 * applications, no permits".
 *
 * Unknown/absent role falls back to the applicant dashboard, which is correct
 * for applicants and harmless for a signed-out user (the route guards redirect).
 */
export function dashboardHomeForRole(role: string | undefined): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "approver":
      return "/approver";
    case "assessor":
      return "/assessment";
    case "verifier":
      return "/verification";
    case "reviewer":
      return "/review";
    case "inspector":
      return "/inspection";
    default:
      return "/dashboard";
  }
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
