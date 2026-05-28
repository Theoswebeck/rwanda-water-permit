"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, Clock, Loader2, MessageSquare } from "lucide-react";

import {
  getAvailableTransitions,
  isTerminalStatus,
  getResponsibleRole,
  normalizeInspectionWorkflowRole,
  type WorkflowTransition,
} from "@/lib/inspection-workflow";
import {
  getInspectionWorkflowLabel,
  getInspectionWorkflowClassName,
  type InspectionWorkflowStatus,
} from "@/types/inspection-workflow";

interface HistoryEntry {
  id: string;
  from_status: string;
  to_status: string;
  action: string;
  comment: string | null;
  created_at: string;
  user_id: string;
  userName?: string;
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

const ACTION_LABELS: Record<string, string> = {
  submit_for_review: "Submitted for Review",
  forward_to_verification: "Forwarded to Verification",
  forward_to_approval: "Forwarded to Approval",
  approve: "Approved",
  reject: "Rejected",
  return_to_assessment: "Returned to Assessment",
  return_to_review: "Returned to Review",
  return_to_verification: "Returned to Verification",
};

function WorkflowHistoryCard({ entries, loading: histLoading }: { entries: HistoryEntry[]; loading: boolean }) {
  if (histLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading workflow history…</span>
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Workflow History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-4">
          {entries.map((entry) => (
            <div key={entry.id} className="relative">
              <div className="absolute -left-[calc(1rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400 dark:bg-slate-500 border-2 border-white dark:border-slate-900" />
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {ACTION_LABELS[entry.action] || entry.action}
                  </span>
                  {entry.userName && (
                    <span className="text-xs text-muted-foreground">
                      by {entry.userName}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {fmtDateTime(entry.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {getInspectionWorkflowLabel(entry.from_status)}
                  </Badge>
                  <span>→</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {getInspectionWorkflowLabel(entry.to_status)}
                  </Badge>
                </div>
                {entry.comment && (
                  <div className="flex items-start gap-1.5 mt-1">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {entry.comment}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
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
  const role = normalizeInspectionWorkflowRole(
    roleContext !== undefined ? roleContext : userProfile?.role
  );
  const userId = userProfile?.id;

  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    transition: WorkflowTransition | null;
  }>({ open: false, transition: null });

  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const transitions = getAvailableTransitions(workflowStatus, role);
  const responsibleRole = getResponsibleRole(workflowStatus);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("inspection_workflow_history")
        .select("id, from_status, to_status, action, comment, created_at, user_id")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("❌ Error fetching workflow history:", error);
        setHistoryEntries([]);
        return;
      }

      const entries = (data || []) as HistoryEntry[];
      const userIds = Array.from(new Set(entries.map((e) => e.user_id).filter(Boolean)));

      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, first_name, last_name")
          .in("id", userIds);

        const nameMap: Record<string, string> = {};
        for (const u of (users || []) as any[]) {
          nameMap[u.id] = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "Unknown";
        }
        for (const entry of entries) {
          entry.userName = nameMap[entry.user_id];
        }
      }

      setHistoryEntries(entries);
    } catch (err) {
      console.error("❌ Error fetching workflow history:", err);
      setHistoryEntries([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

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

        const inspEventMap: Record<string, string> = {
          'submit_for_review': 'inspection_forwarded_to_review',
          'forward_to_review': 'inspection_forwarded_to_review',
          'return_to_assessment': 'inspection_returned_to_assessment',
        }
        const staffEventType = inspEventMap[transition.action]
        if (staffEventType) {
          fetch('/api/notifications/staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventType: staffEventType,
              entityType: 'inspection',
              entityId: inspectionId,
            }),
          }).catch(() => null)
        }

        setNotes("");
        setConfirmDialog({ open: false, transition: null });
        onStatusChange?.(transition.target as InspectionWorkflowStatus);
        fetchHistory();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to update status";
        console.error("❌ Workflow transition error:", err);
        alert(message);
      } finally {
        setLoading(false);
      }
    },
    [inspectionId, userId, workflowStatus, notes, onStatusChange, fetchHistory]
  );

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
        <WorkflowHistoryCard entries={historyEntries} loading={historyLoading} />
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
        <WorkflowHistoryCard entries={historyEntries} loading={historyLoading} />
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
            <div className="flex flex-wrap items-center gap-2">
              {transitions.map((t) => (
                <Button
                  key={t.action}
                  type="button"
                  variant={t.variant}
                  disabled={loading}
                  onClick={() => setConfirmDialog({ open: true, transition: t })}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <WorkflowHistoryCard entries={historyEntries} loading={historyLoading} />
      </div>

      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog({ open: false, transition: null });
            setNotes("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog.transition?.label}</DialogTitle>
            {(confirmDialog.transition?.action === "approve" ||
              confirmDialog.transition?.action === "reject") && (
              <DialogDescription>
                {confirmDialog.transition.action === "approve"
                  ? "Are you sure you want to approve this inspection? This action is final."
                  : "Are you sure you want to reject this inspection? This action is final."}
              </DialogDescription>
            )}
          </DialogHeader>
          {(confirmDialog.transition?.requiresNotes ||
            confirmDialog.transition?.showNotes) && (
            <div className="py-2">
              <Textarea
                placeholder={
                  confirmDialog.transition.requiresNotes
                    ? "Comment is required..."
                    : "Add a comment (optional)..."
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
              onClick={() => {
                setConfirmDialog({ open: false, transition: null });
                setNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant={confirmDialog.transition?.variant === "destructive" ? "destructive" : "default"}
              disabled={
                loading ||
                (!!confirmDialog.transition?.requiresNotes && !notes.trim())
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
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
