import type { UserRole } from "./database";

export type InspectionWorkflowStatus =
  | "draft"
  | "pending_review"
  | "pending_verification"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "returned_to_assessment"
  | "returned_to_review"
  | "returned_to_verification";

export interface InspectionWorkflowStatusConfig {
  label: string;
  className: string;
}

export const INSPECTION_WORKFLOW_STATUS_CONFIG: Record<
  InspectionWorkflowStatus,
  InspectionWorkflowStatusConfig
> = {
  draft: {
    label: "Draft",
    className:
      "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/50 dark:text-slate-300 dark:border-slate-800",
  },
  pending_review: {
    label: "Pending Review",
    className:
      "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800",
  },
  pending_verification: {
    label: "Pending Verification",
    className:
      "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border-cyan-800",
  },
  pending_approval: {
    label: "Pending Approval",
    className:
      "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800",
  },
  approved: {
    label: "Approved",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
  },
  rejected: {
    label: "Rejected",
    className:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
  },
  returned_to_assessment: {
    label: "Returned to Assessment",
    className:
      "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-800",
  },
  returned_to_review: {
    label: "Returned to Review",
    className:
      "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-800",
  },
  returned_to_verification: {
    label: "Returned to Verification",
    className:
      "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-800",
  },
};

export function getInspectionWorkflowLabel(
  status: InspectionWorkflowStatus | string
): string {
  const config =
    INSPECTION_WORKFLOW_STATUS_CONFIG[status as InspectionWorkflowStatus];
  return config?.label ?? status;
}

export function getInspectionWorkflowClassName(
  status: InspectionWorkflowStatus | string
): string {
  const config =
    INSPECTION_WORKFLOW_STATUS_CONFIG[status as InspectionWorkflowStatus];
  return (
    config?.className ??
    "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/50 dark:text-slate-300 dark:border-slate-800"
  );
}

export interface InspectionWorkflowHistoryEntry {
  id: string;
  inspection_id: string;
  user_id: string | null;
  from_status: string | null;
  to_status: string;
  action: string;
  comment: string | null;
  created_at: string;
  user?: {
    first_name?: string;
    last_name?: string;
    role?: UserRole;
  } | null;
}

export type InspectionWorkflowAction =
  | "submit_for_review"
  | "forward_to_verification"
  | "forward_to_approval"
  | "return_to_assessment"
  | "return_to_review"
  | "return_to_verification"
  | "approve"
  | "reject";
