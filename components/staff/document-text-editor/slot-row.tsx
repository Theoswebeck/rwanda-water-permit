"use client";

import { useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Clock, Eye, EyeOff, Hash, RotateCcw } from "lucide-react";

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

/**
 * Slots whose text is fully derived from the permit's issuance / expiry date.
 * Mirrors `lib/document-slots/resolver.ts:isDateBearingSlot` — duplicated
 * here as a tiny local set rather than imported, so the editor bundle does
 * not pull in the entire server-side document-slots module just to check a
 * structuredField marker. */
const DATE_BEARING_STRUCTURED_FIELDS = new Set(["issue_date", "expiry_date"]);

// Mirrors PERMIT_NUMBER_PATTERN in lib/document-slots/resolver.ts. Kept as a
// local literal so the editor bundle doesn't import the server-only resolver
// module. If the resolver pattern changes, update this one too — there's a
// test (or should be) that asserts they stay aligned.
const PERMIT_NUMBER_PATTERN = /(?:WP-)?\d{1,6}\/RWB\/\d{4}|RWBP-\d{4}-\d{1,6}/i;

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

  // Date-bearing slots (closing date line, validity-period paragraphs) are
  // system-managed: their text is rebuilt from the live issuance/expiry date
  // on every render. Before the approver signs the application the date
  // shown is today; once `applications.approved_at` is stamped the date
  // locks to that calendar day. The renderer ignores any saved override
  // for these, the editor API rejects writes to them, and we surface the
  // same constraint in the UI by locking the input and showing a clear
  // "auto" badge instead of letting the assessor type something that will
  // never reach the PDF.
  const isDateBearing = Boolean(
    slot.structuredField &&
      DATE_BEARING_STRUCTURED_FIELDS.has(slot.structuredField),
  );
  // The default text the renderer would emit already has the canonical permit
  // number substituted in. If the assessor sees a permit-number-shaped token
  // here, anything they retype will be normalised back to the same canonical
  // value at PDF render time — so we surface that as a hint instead of letting
  // them think they're authoritative.
  const embedsPermitNumber = PERMIT_NUMBER_PATTERN.test(defaultText);
  const effectiveReadOnly = Boolean(readOnly) || isDateBearing;

  // The text shown in the textarea: latest draft if one exists, else the
  // current effective text (override > default). Date-bearing slots always
  // render the default — even if a stale override exists in the envelope it
  // is intentionally hidden by the API/resolver.
  const effective = isDateBearing ? defaultText : overrideText ?? defaultText;
  const value = isDateBearing
    ? defaultText
    : draft === undefined
      ? effective
      : draft === null
        ? defaultText
        : draft;
  const isOverridden =
    !isDateBearing && overrideText !== null && overrideText !== "";
  const isDirty =
    !isDateBearing &&
    draft !== undefined &&
    !(draft === null ? !isOverridden : draft === effective);
  const softMax = slot.softMaxLength ?? 4000;
  const overSoft = value.length > softMax;
  const overHard = value.length > hardMaxLength;

  const showReset = !isDateBearing && (isOverridden || draft !== undefined);
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
        (isDateBearing
          ? "border-slate-200 bg-slate-50/60 dark:bg-slate-950/20"
          : isDirty
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
        {isDateBearing && (
          <Badge
            variant="outline"
            className="border-slate-300 bg-slate-100 text-slate-700"
            title="This slot's text is rebuilt from the permit's issuance and expiry date on every render. Edits are intentionally disabled so a date saved on a previous day cannot leak into the legal validity paragraph."
          >
            <Clock className="mr-1 h-3 w-3" />
            Auto from system date
          </Badge>
        )}
        {embedsPermitNumber && !isDateBearing && (
          <Badge
            variant="outline"
            className="border-slate-300 bg-slate-100 text-slate-700"
            title="The permit number in this text is auto-managed. The PDF renderer always substitutes the official permit number assigned by the system at issuance, so any number you type here will be normalised on render."
          >
            <Hash className="mr-1 h-3 w-3" />
            Permit number auto-managed
          </Badge>
        )}
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
          disabled={effectiveReadOnly}
          readOnly={isDateBearing}
          onChange={(e) => onChange(e.target.value)}
          maxLength={hardMaxLength}
          spellCheck
          className={overSoft ? "border-amber-400 focus-visible:ring-amber-400" : undefined}
        />
      ) : (
        <Textarea
          id={id}
          value={value}
          disabled={effectiveReadOnly}
          readOnly={isDateBearing}
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

      {isDateBearing && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          The date in this line refreshes every time the preview is rendered.
          Once the approver signs the application, this date locks to the
          approval date and never moves again.
        </p>
      )}

      {supportsBold && !isDateBearing && (
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
