"use client";

/**
 * Read-only "Assessor text edits" panel for the approver review screen.
 *
 * Lists every slot whose current value diverges from the catalogue default
 * (i.e. every override the assessor has saved), grouped by document, with
 * a word-level diff. The `acknowledged` callback fires once the approver has
 * confirmed the checkbox below the diff list — the parent uses that to gate
 * the "Approve" button when overrides exist.
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md §6
 *       and §10 (approver_must_review_changed_slots).
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Eye, Loader2, ShieldAlert } from "lucide-react";

import { diffWords, type DiffSegment } from "@/components/staff/document-text-editor/diff";
import type {
  ClientResolvedSlot,
  EditorPayload,
} from "@/components/staff/document-text-editor/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ApproverChangedSlotsPaneProps = {
  applicationId: string;
  /**
   * Called whenever the approver flips the acknowledgement checkbox AND
   * whenever the override count changes (so a parent button can stay in sync).
   * `count` is the number of overridden slots; `version` is the envelope
   * version the parent should send back to the server in the approval body.
   */
  onAcknowledgementChange?: (state: {
    count: number;
    acknowledged: boolean;
    version: number | null;
  }) => void;
};

type ChangedRow = {
  slot: ClientResolvedSlot;
  diff: DiffSegment[];
};

function buildChangedRows(slots: ClientResolvedSlot[]): ChangedRow[] {
  const rows: ChangedRow[] = [];
  for (const s of slots) {
    if (!s.overrideText) continue;
    if (s.overrideText === s.defaultText) continue;
    rows.push({ slot: s, diff: diffWords(s.defaultText, s.overrideText) });
  }
  return rows;
}

export function ApproverChangedSlotsPane({
  applicationId,
  onAcknowledgementChange,
}: ApproverChangedSlotsPaneProps) {
  const [payload, setPayload] = useState<EditorPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/staff/applications/${encodeURIComponent(applicationId)}/document-text-overrides`, {
      credentials: "include",
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as EditorPayload | { success: false; message?: string } | null;
        if (!res.ok || !json || (json as { success?: boolean }).success !== true) {
          const message =
            (json && typeof (json as { message?: unknown }).message === "string"
              ? (json as { message: string }).message
              : null) ?? `Failed to load (${res.status})`;
          throw new Error(message);
        }
        if (!cancelled) setPayload(json as EditorPayload);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load overrides");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const permitChanged = useMemo(
    () => (payload ? buildChangedRows(payload.permitSlots) : []),
    [payload],
  );
  const contractChanged = useMemo(
    () => (payload ? buildChangedRows(payload.contractSlots) : []),
    [payload],
  );
  const totalChanged = permitChanged.length + contractChanged.length;

  // Notify the parent so it can lock/unlock the Approve button.
  // Reset acknowledgement whenever the envelope version changes so a fresh
  // review is required after every save.
  const envelopeVersion = payload?.envelope.version ?? null;
  useEffect(() => {
    setAcknowledged(false);
  }, [envelopeVersion]);
  useEffect(() => {
    onAcknowledgementChange?.({
      count: totalChanged,
      acknowledged,
      version: envelopeVersion,
    });
  }, [totalChanged, acknowledged, envelopeVersion, onAcknowledgementChange]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4" />
            Assessor text edits
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading override status…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Could not load assessor edits</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (totalChanged === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Check className="h-4 w-4 text-emerald-600" />
            Assessor text edits
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No free-text edits were applied. The permit and contract will be issued
          using the default templates with the structured values from this file.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-300/60 bg-amber-50/30 dark:bg-amber-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          Assessor text edits ({totalChanged})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          The assessor has rewritten {totalChanged} slot{totalChanged === 1 ? "" : "s"}
          {" "}from the default permit/contract template. Review the diffs below
          before approving — issuing the permit will lock these texts onto the
          PDF that the applicant receives.
        </p>

        {permitChanged.length > 0 ? (
          <ChangeList title="Permit" rows={permitChanged} />
        ) : null}
        {contractChanged.length > 0 ? (
          <ChangeList title="Contract" rows={contractChanged} />
        ) : null}

        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-amber-200/80 bg-white/80 p-3 text-sm dark:bg-background/30">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(v === true)}
            aria-label="Acknowledge assessor text edits"
            className="mt-0.5"
          />
          <span>
            I have reviewed the {totalChanged} assessor text edit
            {totalChanged === 1 ? "" : "s"} above and confirm they are accurate
            and approved for issuance.
          </span>
        </label>
      </CardContent>
    </Card>
  );
}

function ChangeList({ title, rows }: { title: string; rows: ChangedRow[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
        <Badge variant="outline">{rows.length}</Badge>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.slot.slot.id}
            className="rounded-md border border-border/60 bg-background/60 p-3"
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{row.slot.slot.label}</span>
              <Badge variant="secondary" className="text-[10px] uppercase">
                {row.slot.slot.language}
              </Badge>
              {row.slot.slot.structuredField ? (
                <Badge variant="outline" className="text-[10px]">
                  also updates: {row.slot.slot.structuredField}
                </Badge>
              ) : null}
            </div>
            <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed">
              {row.diff.map((seg, i) => {
                if (seg.kind === "same") {
                  return <span key={i}>{seg.text}</span>;
                }
                if (seg.kind === "del") {
                  return (
                    <span
                      key={i}
                      className="rounded bg-red-100 px-0.5 text-red-900 line-through dark:bg-red-950/40 dark:text-red-200"
                    >
                      {seg.text}
                    </span>
                  );
                }
                return (
                  <span
                    key={i}
                    className="rounded bg-emerald-100 px-0.5 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                  >
                    {seg.text}
                  </span>
                );
              })}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
