"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, ClipboardList, Loader2, MessageSquare } from "lucide-react";

import {
  getAvailableTransitions,
  isTerminalStatus,
  getResponsibleRole,
  type WorkflowTransition,
} from "@/lib/inspection-workflow";
import {
  getInspectionWorkflowLabel,
  getInspectionWorkflowClassName,
  type InspectionWorkflowStatus,
} from "@/types/inspection-workflow";

interface StepComment {
  label: string;
  role: string;
  notes: string;
  date?: string | null;
  userName?: string | null;
}

interface InspectionWorkflowActionsProps {
  inspectionId: string;
  workflowStatus: InspectionWorkflowStatus | string;
  inspectionStatus: string;
  inspection: Record<string, any>;
  roleContext?: string;
  onStatusChange?: (newStatus: InspectionWorkflowStatus) => void;
}

function fmtDateTime(dateString?: string | null): string {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function StepCommentsCard({ comments }: { comments: StepComment[] }) {
  if (comments.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          Step Comments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        {comments.map((c, idx) => (
          <div key={c.label}>
            {idx > 0 && <Separator className="my-3" />}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{c.label}</span>
                <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                  {c.role}
                </Badge>
                {c.userName && (
                  <span className="text-xs text-muted-foreground">
                    by {c.userName}
                  </span>
                )}
                {c.date && (
                  <span className="text-xs text-muted-foreground">
                    {fmtDateTime(c.date)}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-5">
                {c.notes}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function InspectionWorkflowActions({
  inspectionId,
  workflowStatus,
  inspectionStatus,
  inspection,
  roleContext,
  onStatusChange,
}: InspectionWorkflowActionsProps) {
  const { userProfile } = useAuth();
  const role = roleContext || userProfile?.role || "";
  const userId = userProfile?.id;

  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    transition: WorkflowTransition | null;
  }>({ open: false, transition: null });

  const [userNames, setUserNames] = useState<Record<string, string>>({});

  const transitions = getAvailableTransitions(workflowStatus, role);
  const responsibleRole = getResponsibleRole(workflowStatus);

  useEffect(() => {
    const ids = [
      inspection?.reviewed_by,
      inspection?.verified_by,
      inspection?.approved_by,
      inspection?.inspector_id,
    ].filter(Boolean) as string[];

    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return;

    const fetchNames = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, first_name, last_name")
        .in("id", uniqueIds);

      if (error) {
        console.error("❌ Error fetching user names:", error);
        return;
      }
      const map: Record<string, string> = {};
      for (const u of (data || []) as any[]) {
        map[u.id] = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "Unknown";
      }
      setUserNames(map);
    };
    fetchNames();
  }, [
    inspection?.reviewed_by,
    inspection?.verified_by,
    inspection?.approved_by,
    inspection?.inspector_id,
  ]);

  const handleTransition = useCallback(
    async (transition: WorkflowTransition) => {
      if (!userId) return;

      try {
        setLoading(true);

        const updatePayload: Record<string, unknown> = {
          workflow_status: transition.target,
          updated_at: new Date().toISOString(),
        };

        if (transition.action === "submit_for_review" && notes) {
          updatePayload.assessment_notes = notes;
          updatePayload.assessment_completed_at = new Date().toISOString();
        }

        if (transition.action === "forward_to_verification") {
          updatePayload.review_notes = notes || null;
          updatePayload.reviewed_by = userId;
          updatePayload.reviewed_at = new Date().toISOString();
        }

        if (transition.action === "forward_to_approval") {
          updatePayload.verification_notes = notes || null;
          updatePayload.verified_by = userId;
          updatePayload.verified_at = new Date().toISOString();
        }

        if (transition.action === "approve") {
          updatePayload.approval_notes = notes || null;
          updatePayload.approved_by = userId;
          updatePayload.approved_at = new Date().toISOString();
        }

        if (transition.action === "reject") {
          updatePayload.rejection_reason = notes || null;
          updatePayload.approved_by = userId;
          updatePayload.approved_at = new Date().toISOString();
        }

        if (
          transition.action === "return_to_assessment" ||
          transition.action === "return_to_review" ||
          transition.action === "return_to_verification"
        ) {
          updatePayload.internal_notes = notes || null;
        }

        const { error: updateError } = await supabase
          .from("inspections")
          .update(updatePayload)
          .eq("id", inspectionId);

        if (updateError) throw updateError;

        const { error: historyError } = await supabase
          .from("inspection_workflow_history")
          .insert({
            inspection_id: inspectionId,
            user_id: userId,
            from_status: workflowStatus,
            to_status: transition.target,
            action: transition.action,
            comment: notes || null,
          });

        if (historyError) {
          console.error("❌ Failed to log workflow history:", historyError);
        }

        setNotes("");
        setConfirmDialog({ open: false, transition: null });
        onStatusChange?.(transition.target as InspectionWorkflowStatus);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to update status";
        console.error("❌ Workflow transition error:", err);
        alert(message);
      } finally {
        setLoading(false);
      }
    },
    [inspectionId, userId, workflowStatus, notes, onStatusChange]
  );

  const stepComments: StepComment[] = [];

  if (inspection?.assessment_notes) {
    stepComments.push({
      label: "Assessment",
      role: "Assessor",
      notes: inspection.assessment_notes,
      date: inspection.assessment_completed_at,
      userName: inspection.inspector_id
        ? userNames[inspection.inspector_id]
        : null,
    });
  }

  if (inspection?.review_notes) {
    stepComments.push({
      label: "Review",
      role: "Reviewer",
      notes: inspection.review_notes,
      date: inspection.reviewed_at,
      userName: inspection.reviewed_by
        ? userNames[inspection.reviewed_by]
        : null,
    });
  }

  if (inspection?.verification_notes) {
    stepComments.push({
      label: "Verification",
      role: "Verifier",
      notes: inspection.verification_notes,
      date: inspection.verified_at,
      userName: inspection.verified_by
        ? userNames[inspection.verified_by]
        : null,
    });
  }

  if (inspection?.approval_notes) {
    stepComments.push({
      label: "Approval",
      role: "Approver",
      notes: inspection.approval_notes,
      date: inspection.approved_at,
      userName: inspection.approved_by
        ? userNames[inspection.approved_by]
        : null,
    });
  }

  if (inspection?.rejection_reason) {
    stepComments.push({
      label: "Rejection Reason",
      role: "Approver",
      notes: inspection.rejection_reason,
      date: inspection.approved_at,
      userName: inspection.approved_by
        ? userNames[inspection.approved_by]
        : null,
    });
  }

  if (inspection?.internal_notes) {
    stepComments.push({
      label: "Return Notes",
      role: "Staff",
      notes: inspection.internal_notes,
    });
  }

  if (inspectionStatus !== "completed") {
    return null;
  }

  if (isTerminalStatus(workflowStatus)) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="font-medium">
                This inspection has been{" "}
                <Badge
                  variant="outline"
                  className={`${getInspectionWorkflowClassName(workflowStatus)} text-xs font-medium px-2 py-0.5 rounded-full border`}
                >
                  {getInspectionWorkflowLabel(workflowStatus)}
                </Badge>
              </span>
            </div>
          </CardContent>
        </Card>
        <StepCommentsCard comments={stepComments} />
      </div>
    );
  }

  if (transitions.length === 0) {
    const waitingFor = responsibleRole
      ? `Waiting for ${responsibleRole}`
      : "No actions available";
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm">{waitingFor}</span>
              <Badge
                variant="outline"
                className={`${getInspectionWorkflowClassName(workflowStatus)} text-xs font-medium px-2 py-0.5 rounded-full border`}
              >
                {getInspectionWorkflowLabel(workflowStatus)}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <StepCommentsCard comments={stepComments} />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-3">
              Workflow Actions
              <Badge
                variant="outline"
                className={`${getInspectionWorkflowClassName(workflowStatus)} text-xs font-medium px-2 py-0.5 rounded-full border`}
              >
                {getInspectionWorkflowLabel(workflowStatus)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Notes for forwarding/returns (required where applicable)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />

            <div className="flex flex-wrap items-center gap-2">
              {transitions.map((t) => (
                <Button
                  key={t.action}
                  type="button"
                  variant={t.variant}
                  disabled={loading || (t.requiresNotes && !notes.trim())}
                  onClick={() => {
                    if (t.action === "approve" || t.action === "reject") {
                      setConfirmDialog({ open: true, transition: t });
                    } else {
                      handleTransition(t);
                    }
                  }}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {t.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <StepCommentsCard comments={stepComments} />
      </div>

      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog({ open: false, transition: null });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.transition?.action === "approve"
                ? "Approve Inspection"
                : "Reject Inspection"}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.transition?.action === "approve"
                ? "Are you sure you want to approve this inspection? This action is final."
                : "Are you sure you want to reject this inspection? This action is final."}
            </DialogDescription>
          </DialogHeader>
          {confirmDialog.transition?.requiresNotes && (
            <div className="py-2">
              <Textarea
                placeholder={
                  confirmDialog.transition.action === "reject"
                    ? "Reason for rejection (required)..."
                    : "Approval notes..."
                }
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setConfirmDialog({ open: false, transition: null })
              }
            >
              Cancel
            </Button>
            <Button
              variant={
                confirmDialog.transition?.action === "reject"
                  ? "destructive"
                  : "default"
              }
              disabled={
                loading ||
                (confirmDialog.transition?.action === "reject" &&
                  !notes.trim())
              }
              onClick={() => {
                if (confirmDialog.transition) {
                  handleTransition(confirmDialog.transition);
                }
              }}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {confirmDialog.transition?.action === "approve"
                ? "Confirm Approval"
                : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
