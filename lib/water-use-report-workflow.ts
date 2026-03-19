import type { UserRole } from "@/types/database";
import type {
  WaterUseReportWorkflowStatus,
  WaterUseReportWorkflowAction,
} from "@/types/water-use-report-workflow";

interface WorkflowTransition {
  target: WaterUseReportWorkflowStatus;
  action: WaterUseReportWorkflowAction;
  label: string;
  variant: "default" | "outline" | "destructive";
  requiresNotes?: boolean;
}

const SUBMIT_FOR_REVIEW_TRANSITION: WorkflowTransition[] = [
  {
    target: "pending_review",
    action: "submit_for_review",
    label: "Submit for Review",
    variant: "default",
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

const TRANSITION_MAP: Record<
  string,
  Record<string, WorkflowTransition[]>
> = {
  pending_assessment: {
    assessor: SUBMIT_FOR_REVIEW_TRANSITION,
    admin: SUBMIT_FOR_REVIEW_TRANSITION,
  },
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
  workflowStatus: WaterUseReportWorkflowStatus | string,
  role: UserRole | string
): WorkflowTransition[] {
  const statusTransitions = TRANSITION_MAP[workflowStatus];
  if (!statusTransitions) return [];
  return statusTransitions[role] ?? [];
}

export function canActOnWaterUseReport(
  workflowStatus: WaterUseReportWorkflowStatus | string,
  role: UserRole | string
): boolean {
  return getAvailableTransitions(workflowStatus, role).length > 0;
}

export function getResponsibleRole(
  workflowStatus: WaterUseReportWorkflowStatus | string
): UserRole | null {
  switch (workflowStatus) {
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
  workflowStatus: WaterUseReportWorkflowStatus | string
): boolean {
  return workflowStatus === "approved" || workflowStatus === "rejected";
}

export function getWaterUseReportBasePath(role: string | undefined): string {
  switch (role) {
    case "reviewer":
      return "/review/water-use-report";
    case "assessor":
      return "/assessment/water-use-report";
    case "verifier":
      return "/verification/water-use-report";
    case "approver":
      return "/approver/water-use-report";
    case "admin":
      return "/review/water-use-report";
    default:
      return "/water-use-report";
  }
}

export type { WorkflowTransition };
