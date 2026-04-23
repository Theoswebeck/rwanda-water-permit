"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

import { diffWords } from "./diff";
import type { DiffEntry } from "./types";

export interface SaveDiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: DiffEntry[];
  saving: boolean;
  errorMessage: string | null;
  onConfirm: () => Promise<void> | void;
}

export function SaveDiffDialog({
  open,
  onOpenChange,
  entries,
  saving,
  errorMessage,
  onConfirm,
}: SaveDiffDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  const grouped = groupByDocument(entries);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        if (!next) setAcknowledged(false);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Confirm document text changes
          </DialogTitle>
          <DialogDescription>
            Review every change below before saving. Saved changes will appear in the live
            permit / contract preview immediately and require approver re-confirmation
            before issuance.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] px-6 py-4">
          <div className="space-y-5">
            {grouped.map(({ doc, items }) => (
              <section key={doc} className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {doc === "permit" ? "Permit" : "Contract"} — {items.length}{" "}
                  {items.length === 1 ? "change" : "changes"}
                </h3>
                {items.map((entry) => (
                  <DiffCard key={entry.slotId} entry={entry} />
                ))}
              </section>
            ))}
            {entries.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No effective changes — every draft matches the current text. Cancel and
                continue editing.
              </p>
            )}
          </div>
        </ScrollArea>

        {errorMessage && (
          <div className="border-t border-red-200 bg-red-50 px-6 py-3 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        <DialogFooter className="flex-col items-stretch gap-3 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
              disabled={saving || entries.length === 0}
              className="mt-0.5"
            />
            <span className="leading-snug">
              I have reviewed every change above and confirm the wording is correct. The
              approver will be required to re-review these edits before issuance.
            </span>
          </label>
          <div className="flex gap-2 sm:ml-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => onConfirm()}
              disabled={!acknowledged || saving || entries.length === 0}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? "Saving…" : `Save ${entries.length} change${entries.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function groupByDocument(
  entries: DiffEntry[],
): { doc: "permit" | "contract"; items: DiffEntry[] }[] {
  const out: Record<"permit" | "contract", DiffEntry[]> = { permit: [], contract: [] };
  for (const e of entries) out[e.documentKind].push(e);
  return (["permit", "contract"] as const)
    .map((doc) => ({ doc, items: out[doc] }))
    .filter((g) => g.items.length > 0);
}

function DiffCard({ entry }: { entry: DiffEntry }) {
  const segments = diffWords(entry.before, entry.after);
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{entry.label}</span>
        <Badge
          variant="outline"
          className={
            entry.kind === "set"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : entry.kind === "reset"
                ? "border-slate-300 bg-slate-50 text-slate-700"
                : "border-blue-300 bg-blue-50 text-blue-800"
          }
        >
          {entry.kind === "set" ? "New override" : entry.kind === "reset" ? "Reset to default" : "Updated"}
        </Badge>
        {entry.structuredField && (
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
            also: {entry.structuredField}
          </Badge>
        )}
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {entry.slotId}
        </span>
      </div>
      <div className="space-y-2 text-sm leading-relaxed">
        <div className="rounded border border-red-200 bg-red-50/60 p-2 font-mono text-xs">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-red-700">
            Current
          </div>
          <pre className="whitespace-pre-wrap break-words text-red-900">
            {entry.before || "(empty)"}
          </pre>
        </div>
        <div className="rounded border border-emerald-200 bg-emerald-50/60 p-2 font-mono text-xs">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            After save
          </div>
          <pre className="whitespace-pre-wrap break-words text-emerald-900">
            {entry.after || "(empty)"}
          </pre>
        </div>
        <div className="rounded border bg-background p-2 text-xs">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Word-level diff
          </div>
          <p className="whitespace-pre-wrap break-words leading-relaxed">
            {segments.map((seg, i) => {
              if (seg.kind === "same") return <span key={i}>{seg.text}</span>;
              if (seg.kind === "del")
                return (
                  <span key={i} className="bg-red-100 text-red-900 line-through decoration-red-500">
                    {seg.text}
                  </span>
                );
              return (
                <span key={i} className="bg-emerald-100 text-emerald-900 underline decoration-emerald-600">
                  {seg.text}
                </span>
              );
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
