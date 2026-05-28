import type { UserRole } from "@/types/database";
import type {
  InspectionWorkflowStatus,
  InspectionWorkflowAction,
} from "@/types/inspection-workflow";

interface WorkflowTransition {
  target: InspectionWorkflowStatus;
  action: InspectionWorkflowAction;
  label: string;
  variant: "default" | "outline" | "destructive";
  requiresNotes?: boolean;
  showNotes?: boolean;
}

const INSPECTION_WORKFLOW_ROLES: ReadonlySet<UserRole> = new Set([
  "admin",
  "approver",
  "assessor",
  "reviewer",
  "verifier",
]);

export function normalizeInspectionWorkflowRole(
  role: UserRole | string | null | undefined
): UserRole | "" {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (!normalized) return "";
  if (!INSPECTION_WORKFLOW_ROLES.has(normalized as UserRole)) return "";
  return normalized as UserRole;
}

const REVIEW_TRANSITIONS: WorkflowTransition[] = [
  {
    target: "pending_verification",
    action: "forward_to_verification",
    label: "Forward to Verifier",
    variant: "default",
    showNotes: true,
  },
  {
    target: "returned_to_assessment",
    action: "return_to_assessment",
    label: "Return to Assessor",
    variant: "outline",
    requiresNotes: true,
  },
];

const VERIFICATION_TRANSITIONS: WorkflowTransition[] = [
  {
    target: "pending_approval",
    action: "forward_to_approval",
    label: "Forward to Approver",
    variant: "default",
    showNotes: true,
  },
  {
    target: "returned_to_review",
    action: "return_to_review",
    label: "Return to Reviewer",
    variant: "outline",
    requiresNotes: true,
  },
];

const APPROVAL_TRANSITIONS: WorkflowTransition[] = [
  {
    target: "approved",
    action: "approve",
    label: "Approve",
    variant: "default",
  },
  {
    target: "rejected",
    action: "reject",
    label: "Reject",
    variant: "destructive",
    requiresNotes: true,
  },
  {
    target: "returned_to_verification",
    action: "return_to_verification",
    label: "Return to Verifier",
    variant: "outline",
    requiresNotes: true,
  },
];

const ASSESSMENT_TRANSITIONS: WorkflowTransition[] = [
  {
    target: "pending_review",
    action: "forward_to_review",
    label: "Forward to Reviewer",
    variant: "default",
    showNotes: true,
  },
];

const RESUBMIT_TRANSITION: WorkflowTransition[] = [
  {
    target: "pending_review",
    action: "submit_for_review",
    label: "Resubmit for Review",
    variant: "default",
    requiresNotes: true,
  },
];

const TRANSITION_MAP: Record<
  string,
  Record<string, WorkflowTransition[]>
> = {
  pending_assessment: {
    assessor: ASSESSMENT_TRANSITIONS,
    admin: ASSESSMENT_TRANSITIONS,
  },
  returned_to_assessment: {
    assessor: RESUBMIT_TRANSITION,
    admin: RESUBMIT_TRANSITION,
  },
  submitted: {
    reviewer: REVIEW_TRANSITIONS,
    admin: REVIEW_TRANSITIONS,
  },
  pending_review: {
    reviewer: REVIEW_TRANSITIONS,
    admin: REVIEW_TRANSITIONS,
  },
  returned_to_review: {
    reviewer: REVIEW_TRANSITIONS,
    admin: REVIEW_TRANSITIONS,
  },
  pending_verification: {
    verifier: VERIFICATION_TRANSITIONS,
    admin: VERIFICATION_TRANSITIONS,
  },
  returned_to_verification: {
    verifier: VERIFICATION_TRANSITIONS,
    admin: VERIFICATION_TRANSITIONS,
  },
  pending_approval: {
    approver: APPROVAL_TRANSITIONS,
    admin: APPROVAL_TRANSITIONS,
  },
};

export function getAvailableTransitions(
  workflowStatus: InspectionWorkflowStatus | string,
  role: UserRole | string
): WorkflowTransition[] {
  const statusTransitions = TRANSITION_MAP[workflowStatus];
  if (!statusTransitions) return [];
  const normalizedRole = normalizeInspectionWorkflowRole(role);
  if (!normalizedRole) return [];
  return statusTransitions[normalizedRole] ?? [];
}

export function canActOnInspection(
  workflowStatus: InspectionWorkflowStatus | string,
  role: UserRole | string
): boolean {
  return getAvailableTransitions(workflowStatus, role).length > 0;
}

const ASSESSOR_OWNED_WORKFLOW: ReadonlySet<string> = new Set([
  "draft",
  "pending_assessment",
  "returned_to_assessment",
]);

// Workflow states in which the assigned assessor still owns the inspection
// and is expected to keep editing it. Used by the inspection editor pages
// to gate `canEditForm`. Treats null/empty as "draft" so legacy rows
// without a workflow_status are editable by their owner.
export function isAssessorOwnedWorkflow(
  workflowStatus: string | null | undefined
): boolean {
  return ASSESSOR_OWNED_WORKFLOW.has((workflowStatus ?? "draft").trim() || "draft");
}

export function getResponsibleRole(
  workflowStatus: InspectionWorkflowStatus | string
): UserRole | null {
  switch (workflowStatus) {
    case "submitted":
      return "reviewer";
    case "pending_assessment":
    case "returned_to_assessment":
      return "assessor";
    case "pending_review":
    case "returned_to_review":
      return "reviewer";
    case "pending_verification":
    case "returned_to_verification":
      return "verifier";
    case "pending_approval":
      return "approver";
    default:
      return null;
  }
}

export function isTerminalStatus(
  workflowStatus: InspectionWorkflowStatus | string
): boolean {
  return workflowStatus === "approved" || workflowStatus === "rejected";
}

export function getInspectionBasePath(role: string | undefined): string {
  switch (role) {
    case "reviewer":
      return "/review/inspection";
    case "assessor":
      return "/assessment/inspection";
    case "verifier":
      return "/verification/inspection";
    case "approver":
      return "/approver/inspection";
    case "admin":
      return "/review/inspection";
    default:
      return "/inspection";
  }
}

export function getApplicationBasePath(role: string | undefined): string {
  switch (role) {
    case "reviewer":
    case "admin":
      return "/review/application";
    case "assessor":
      return "/assessment/application";
    case "verifier":
      return "/verification/application";
    case "approver":
      return "/approver/application";
    default:
      return "/inspection/application";
  }
}

export type { WorkflowTransition };
