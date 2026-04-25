"use client";

import { useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  hasBalancedBoldMarkers,
  parseBoldRuns,
} from "@/lib/document-slots/bold-markers";

import type { ClientResolvedSlot } from "./types";

// Slots are considered "paragraph-style" when their soft cap allows more than
// a one-line label. The bold-syntax hint is only worth surfacing on those —
// the title, signatory line, and modified-permit badge would never want
// inline emphasis and the hint just adds visual noise there.
const HINT_MIN_SOFT_MAX = 200;

export interface SlotRowProps {
  resolved: ClientResolvedSlot;
  /** Current draft. Undefined when no edit has been made; null when "reset"
   *  was clicked; string otherwise. */
  draft: string | null | undefined;
  onChange: (text: string) => void;
  onReset: () => void;
  /** Hard server-side cap. Soft cap comes from the slot definition. */
  hardMaxLength: number;
  readOnly?: boolean;
}

export function SlotRow({
  resolved,
  draft,
  onChange,
  onReset,
  hardMaxLength,
  readOnly,
}: SlotRowProps) {
  const id = useId();
  const { slot, defaultText, overrideText, editedAt, editedBy } = resolved;

  // The text shown in the textarea: latest draft if one exists, else the
  // current effective text (override > default).
  const effective = overrideText ?? defaultText;
  const value = draft === undefined ? effective : draft === null ? defaultText : draft;
  const isOverridden = overrideText !== null && overrideText !== "";
  const isDirty =
    draft !== undefined &&
    !(draft === null ? !isOverridden : draft === effective);
  const softMax = slot.softMaxLength ?? 4000;
  const overSoft = value.length > softMax;
  const overHard = value.length > hardMaxLength;

  const showReset = isOverridden || draft !== undefined;
  const formattedEditedAt = editedAt ? formatTimestamp(editedAt) : null;

  // Inline-bold affordance state. Only shown for paragraph-style slots and
  // only when the text already contains `**`, so the hint never appears
  // unsolicited on simple labels.
  const [previewOpen, setPreviewOpen] = useState(false);
  const supportsBold = !slot.inline && (slot.softMaxLength ?? 0) >= HINT_MIN_SOFT_MAX;
  const containsMarkers = supportsBold && /\*\*/.test(value);
  const balanced = !containsMarkers || hasBalancedBoldMarkers(value);
  const previewRuns = useMemo(
    () => (containsMarkers && previewOpen ? parseBoldRuns(value) : []),
    [containsMarkers, previewOpen, value],
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={
        "rounded-lg border bg-card p-3 transition-colors " +
        (isDirty
          ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/10"
          : isOverridden
            ? "border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/10"
            : "border-border")
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm font-medium leading-none">
          {slot.label}
        </label>
        {isOverridden && (
          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Edited
          </Badge>
        )}
        {isDirty && (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
            Unsaved
          </Badge>
        )}
        {containsMarkers && !balanced && (
          <Badge
            variant="outline"
            className="border-red-300 bg-red-50 text-red-800"
            title="Every opening ** needs a matching closing **. Type \\*\\* if you want a literal ** in the document."
          >
            <AlertTriangle className="mr-1 h-3 w-3" />
            Unbalanced **…**
          </Badge>
        )}
        {slot.structuredField && (
          <Badge
            variant="secondary"
            className="text-[10px] uppercase tracking-wider"
            title={`Linked to structured field "${slot.structuredField}".`}
          >
            {slot.structuredField}
          </Badge>
        )}
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{slot.id}</span>
      </div>

      {slot.inline ? (
        <Input
          id={id}
          value={value}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
          maxLength={hardMaxLength}
          spellCheck
          className={overSoft ? "border-amber-400 focus-visible:ring-amber-400" : undefined}
        />
      ) : (
        <Textarea
          id={id}
          value={value}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
          rows={Math.max(3, Math.min(14, Math.ceil(value.length / 90)))}
          maxLength={hardMaxLength}
          spellCheck
          className={
            "min-h-[6rem] font-mono text-sm leading-relaxed " +
            (overSoft ? "border-amber-400 focus-visible:ring-amber-400" : "")
          }
        />
      )}

      {supportsBold && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            Use <code className="rounded bg-muted px-1 py-0.5">**bold**</code>{" "}
            for emphasis. Type{" "}
            <code className="rounded bg-muted px-1 py-0.5">{"\\*\\*"}</code>{" "}
            for a literal <code className="rounded bg-muted px-1 py-0.5">**</code>.
          </span>
          {containsMarkers && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setPreviewOpen((v) => !v)}
            >
              {previewOpen ? (
                <>
                  <EyeOff className="mr-1 h-3 w-3" /> Hide preview
                </>
              ) : (
                <>
                  <Eye className="mr-1 h-3 w-3" /> Show preview
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {previewOpen && containsMarkers && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="mt-2 overflow-hidden rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 p-3 text-sm leading-relaxed"
        >
          <p className="whitespace-pre-wrap break-words">
            {previewRuns.map((run, i) =>
              run.bold ? (
                <span key={i} className="font-semibold">
                  {run.text}
                </span>
              ) : (
                <span key={i}>{run.text}</span>
              ),
            )}
          </p>
        </motion.div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className={overHard ? "text-red-600" : overSoft ? "text-amber-700" : undefined}>
          {value.length.toLocaleString()} / {hardMaxLength.toLocaleString()} chars
          {overSoft && !overHard && " (long — consider trimming)"}
          {overHard && " (over hard limit — won't save)"}
        </span>
        {formattedEditedAt && editedBy && (
          <span className="text-muted-foreground">
            Last edited by <span className="font-medium">{editedBy.name}</span> · {formattedEditedAt}
          </span>
        )}
        {showReset && !readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            onClick={onReset}
          >
            <RotateCcw className="mr-1 h-3 w-3" /> Reset to default
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
