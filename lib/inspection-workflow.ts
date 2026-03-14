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
  requiresAssignment?: boolean;
}

const TRANSITION_MAP: Record<
  string,
  Record<string, WorkflowTransition[]>
> = {
  submitted: {
    reviewer: [
      {
        target: "pending_assessment",
        action: "assign_assessor",
        label: "Assign Assessor",
        variant: "default",
        requiresAssignment: true,
      },
    ],
    admin: [
      {
        target: "pending_assessment",
        action: "assign_assessor",
        label: "Assign Assessor",
        variant: "default",
        requiresAssignment: true,
      },
    ],
  },
  pending_assessment: {
    assessor: [
      {
        target: "under_assessment",
        action: "start_assessment",
        label: "Start Assessment",
        variant: "default",
      },
    ],
  },
  returned_to_assessment: {
    assessor: [
      {
        target: "under_assessment",
        action: "start_assessment",
        label: "Resume Assessment",
        variant: "default",
      },
    ],
  },
  under_assessment: {
    assessor: [
      {
        target: "pending_review",
        action: "forward_to_review",
        label: "Forward to Reviewer",
        variant: "default",
        requiresNotes: true,
      },
    ],
  },
  pending_review: {
    reviewer: [
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
    ],
    admin: [
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
    ],
  },
  returned_to_review: {
    reviewer: [
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
    ],
    admin: [
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
    ],
  },
  pending_verification: {
    verifier: [
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
    ],
    admin: [
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
    ],
  },
  returned_to_verification: {
    verifier: [
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
    ],
    admin: [
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
    ],
  },
  pending_approval: {
    approver: [
      {
        target: "approved",
        action: "approve",
        label: "Approve",
        variant: "default",
        requiresNotes: true,
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
    ],
    admin: [
      {
        target: "approved",
        action: "approve",
        label: "Approve",
        variant: "default",
        requiresNotes: true,
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
    ],
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
    case "submitted":
    case "pending_review":
    case "returned_to_review":
      return "reviewer";
    case "pending_assessment":
    case "under_assessment":
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
