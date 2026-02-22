/**
 * Workflow Dates Utility
 *
 * Batch-fetches workflow_history rows for a set of application IDs and extracts
 * the *first* timestamp for each meaningful status transition.  This lets staff
 * dashboard tables display multi-date columns (Applied, Assigned, Assessed,
 * Reviewed, Verified, Approved) without N+1 queries.
 */

import { supabase } from "@/lib/supabase";

/** Dates we extract from workflow_history for each application. */
export interface WorkflowDates {
  /** When the application was submitted (from applications.submitted_at). */
  appliedAt?: string | null;
  /** When it was assigned to an assessor (first transition to pending_assessment). */
  assignedAt?: string | null;
  /** When assessment was completed (first transition to pending_review). */
  assessedAt?: string | null;
  /** When review was completed / sent to verification (first transition to pending_verification). */
  reviewedAt?: string | null;
  /** When verification was completed / sent to approver (first transition to pending_final_approval). */
  verifiedAt?: string | null;
  /** When the approver made a decision (first transition to approved / approved_pending_permit / rejected). */
  approvedAt?: string | null;
}

/**
 * Map of status transitions -> which WorkflowDates key they populate.
 * We take the *earliest* created_at for each.
 */
const STATUS_TO_DATE_KEY: Record<string, keyof WorkflowDates> = {
  pending_assessment: "assignedAt",
  pending_review: "assessedAt",
  pending_verification: "reviewedAt",
  pending_final_approval: "verifiedAt",
  approved: "approvedAt",
  approved_pending_permit: "approvedAt",
  rejected: "approvedAt", // decision date
};

/**
 * Batch-fetch workflow dates for many applications at once.
 *
 * @param applicationIds  UUIDs of the applications to look up.
 * @param submittedAtMap  Optional map of applicationId -> submitted_at from the
 *                        applications query (avoids an extra round-trip).
 * @returns A map from applicationId to WorkflowDates.
 */
export async function batchFetchWorkflowDates(
  applicationIds: string[],
  submittedAtMap?: Record<string, string | null>
): Promise<Record<string, WorkflowDates>> {
  const result: Record<string, WorkflowDates> = {};

  if (applicationIds.length === 0) return result;

  // Initialise with submitted_at when provided
  for (const id of applicationIds) {
    result[id] = {
      appliedAt: submittedAtMap?.[id] ?? null,
    };
  }

  try {
    // Supabase .in() has a practical limit of ~300 items.
    // Chunk if necessary (rare in dashboard context).
    const CHUNK = 250;
    const chunks: string[][] = [];
    for (let i = 0; i < applicationIds.length; i += CHUNK) {
      chunks.push(applicationIds.slice(i, i + CHUNK));
    }

    for (const chunk of chunks) {
      const { data, error } = await supabase
        .from("workflow_history")
        .select("application_id, to_status, created_at")
        .in("application_id", chunk)
        .in("to_status", Object.keys(STATUS_TO_DATE_KEY))
        .order("created_at", { ascending: true });

      if (error) {
        console.error("❌ Failed to fetch workflow dates:", error);
        continue;
      }

      // For each row, populate the *first* (earliest) occurrence per key
      for (const row of data ?? []) {
        const appId = row.application_id as string;
        const dateKey = STATUS_TO_DATE_KEY[row.to_status as string];
        if (!dateKey) continue;

        if (!result[appId]) {
          result[appId] = { appliedAt: submittedAtMap?.[appId] ?? null };
        }

        // Only set if not already set (we ordered ascending, so first hit wins)
        if (!result[appId][dateKey]) {
          result[appId][dateKey] = row.created_at as string;
        }
      }
    }
  } catch (err) {
    console.error("❌ Unexpected error in batchFetchWorkflowDates:", err);
  }

  return result;
}
