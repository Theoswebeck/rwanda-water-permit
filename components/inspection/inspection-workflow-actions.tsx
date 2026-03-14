"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

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

type StaffMember = {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  email: string;
};

interface InspectionWorkflowActionsProps {
  inspectionId: string;
  workflowStatus: InspectionWorkflowStatus | string;
  inspectionStatus: string;
  onStatusChange?: (newStatus: InspectionWorkflowStatus) => void;
}

export function InspectionWorkflowActions({
  inspectionId,
  workflowStatus,
  inspectionStatus,
  onStatusChange,
}: InspectionWorkflowActionsProps) {
  const { userProfile } = useAuth();
  const role = userProfile?.role ?? "";
  const userId = userProfile?.id;

  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    transition: WorkflowTransition | null;
  }>({ open: false, transition: null });

  // Assessor assignment state
  const [assessors, setAssessors] = useState<StaffMember[]>([]);
  const [selectedAssessorId, setSelectedAssessorId] = useState("");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  const transitions = getAvailableTransitions(workflowStatus, role);
  const responsibleRole = getResponsibleRole(workflowStatus);

  useEffect(() => {
    if (
      (role === "reviewer" || role === "admin") &&
      (workflowStatus === "submitted")
    ) {
      const fetchAssessors = async () => {
        const { data, error } = await supabase
          .from("users")
          .select("id, first_name, last_name, role, email")
          .in("role", ["assessor"])
          .eq("status", "active")
          .order("first_name", { ascending: true });

        if (error) {
          console.error("❌ Error fetching assessors:", error);
          return;
        }
        setAssessors(data || []);
      };
      fetchAssessors();
    }
  }, [role, workflowStatus]);

  const handleTransition = useCallback(
    async (transition: WorkflowTransition, assigneeId?: string) => {
      if (!userId) return;

      try {
        setLoading(true);

        const updatePayload: Record<string, unknown> = {
          workflow_status: transition.target,
          updated_at: new Date().toISOString(),
        };

        if (transition.action === "assign_assessor" && assigneeId) {
          updatePayload.assigned_assessor_id = assigneeId;
        }

        if (transition.action === "forward_to_review" && notes) {
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

        const selectedAssessor = assigneeId
          ? assessors.find((a) => a.id === assigneeId)
          : null;

        const comment =
          transition.action === "assign_assessor" && selectedAssessor
            ? `Assigned to ${selectedAssessor.first_name} ${selectedAssessor.last_name} for assessment`
            : notes || null;

        const { error: historyError } = await supabase
          .from("inspection_workflow_history")
          .insert({
            inspection_id: inspectionId,
            user_id: userId,
            from_status: workflowStatus,
            to_status: transition.target,
            action: transition.action,
            comment,
          });

        if (historyError) {
          console.error("❌ Failed to log workflow history:", historyError);
        }

        setNotes("");
        setConfirmDialog({ open: false, transition: null });
        setAssignDialogOpen(false);
        setSelectedAssessorId("");
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
    [
      inspectionId,
      userId,
      workflowStatus,
      notes,
      assessors,
      onStatusChange,
    ]
  );

  if (inspectionStatus !== "completed") {
    return null;
  }

  if (isTerminalStatus(workflowStatus)) {
    return (
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
    );
  }

  if (transitions.length === 0) {
    const waitingFor = responsibleRole
      ? `Waiting for ${responsibleRole}`
      : "No actions available";
    return (
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
    );
  }

  const hasAssignAction = transitions.some(
    (t) => t.action === "assign_assessor"
  );
  const otherTransitions = transitions.filter(
    (t) => t.action !== "assign_assessor"
  );
  const anyRequiresNotes = otherTransitions.some((t) => t.requiresNotes);

  return (
    <>
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
          {anyRequiresNotes && (
            <Textarea
              placeholder="Notes (required for some actions)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            {hasAssignAction && (
              <Button
                type="button"
                variant="default"
                disabled={loading}
                onClick={() => setAssignDialogOpen(true)}
              >
                Assign Assessor
              </Button>
            )}

            {otherTransitions.map((t) => (
              <Button
                key={t.action}
                type="button"
                variant={t.variant}
                disabled={loading || (t.requiresNotes && !notes.trim())}
                onClick={() => {
                  if (
                    t.action === "approve" ||
                    t.action === "reject"
                  ) {
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

      {/* Assign Assessor Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Assessor</DialogTitle>
            <DialogDescription>
              Select an assessor to review this inspection report.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select
              value={selectedAssessorId}
              onValueChange={setSelectedAssessorId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an assessor..." />
              </SelectTrigger>
              <SelectContent>
                {assessors.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.first_name} {a.last_name} ({a.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssignDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedAssessorId || loading}
              onClick={() => {
                const assignTransition = transitions.find(
                  (t) => t.action === "assign_assessor"
                );
                if (assignTransition) {
                  handleTransition(assignTransition, selectedAssessorId);
                }
              }}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Approve/Reject Dialog */}
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
