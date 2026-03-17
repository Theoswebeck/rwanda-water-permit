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
}

const REVIEW_TRANSITIONS: WorkflowTransition[] = [
  {
    target: "pending_verification",
    action: "forward_to_verification",
    label: "Forward to Verifier",
    variant: "default",
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
  returned_to_assessment: {
    assessor: RESUBMIT_TRANSITION,
    admin: RESUBMIT_TRANSITION,
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
  return statusTransitions[role] ?? [];
}

export function canActOnInspection(
  workflowStatus: InspectionWorkflowStatus | string,
  role: UserRole | string
): boolean {
  return getAvailableTransitions(workflowStatus, role).length > 0;
}

export function getResponsibleRole(
  workflowStatus: InspectionWorkflowStatus | string
): UserRole | null {
  switch (workflowStatus) {
    case "pending_review":
    case "returned_to_review":
      return "reviewer";
    case "returned_to_assessment":
      return "assessor";
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

export type { WorkflowTransition };
