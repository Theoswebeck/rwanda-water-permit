"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Save, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DOCUMENT_OVERRIDE_FIELD_GROUPS,
  DOCUMENT_OVERRIDE_KEYS,
  type ApplicationForOverrides,
  type DocumentOverrideEnvelope,
  type DocumentOverrideKey,
  type DocumentOverrideValue,
  type DocumentOverrideValues,
  getDocumentOverrideEnvelopeFromNotes,
  getEffectiveDocumentValues,
  parseInternalNotes,
} from "@/lib/document-overrides";

type SaveState = "idle" | "saving" | "saved" | "error";

type DocumentValuesEditorProps = {
  applicationId: string;
  /**
   * Application data used to derive the *effective* value for each editable
   * field (override > underlying column / notes default). Required so the
   * editor can prefill inputs with what the assessor currently sees in the
   * permit/contract preview.
   */
  application: ApplicationForOverrides;
  readOnly?: boolean;
  onInternalNotesChange?: (nextInternalNotes: string) => void;
  /** Called after each successful save so the parent can refresh the permit preview. */
  onSaved?: () => void;
};

const MULTISELECT_KEYS = new Set<DocumentOverrideKey>(["intendedActivities"]);

type EditableMap = Record<DocumentOverrideKey, string | string[]>;

function toEditableMap(values: Record<DocumentOverrideKey, string | string[]>): EditableMap {
  const next = {} as EditableMap;
  for (const key of DOCUMENT_OVERRIDE_KEYS) {
    const v = values[key];
    if (MULTISELECT_KEYS.has(key)) {
      next[key] = Array.isArray(v) ? v.map(String) : [];
    } else {
      next[key] = typeof v === "string" ? v : v == null ? "" : String(v);
    }
  }
  return next;
}

function arraysEqualUnordered(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

type ChangeRow = {
  key: DocumentOverrideKey;
  label: string;
  before: string;
  after: string;
};

function labelForKey(key: DocumentOverrideKey): string {
  for (const group of DOCUMENT_OVERRIDE_FIELD_GROUPS) {
    for (const field of group.fields) {
      if (field.key === key) return field.label;
    }
  }
  return key;
}

function formatValueForDisplay(key: DocumentOverrideKey, value: string | string[]): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    // Try to translate codes → labels using the field options.
    for (const group of DOCUMENT_OVERRIDE_FIELD_GROUPS) {
      for (const field of group.fields) {
        if (field.key === key && field.kind === "multiselect") {
          const map = new Map(field.options.map((o) => [o.value, o.label]));
          return value.map((v) => map.get(v) ?? v).join(", ");
        }
      }
    }
    return value.join(", ");
  }
  const t = value.trim();
  return t || "—";
}

/**
 * Compute the patch to send to the server: only fields where the user's input
 * differs from the *effective* value they were shown when the form opened
 * (so re-typing the prefilled value does not create an override).
 */
function buildPatch(
  current: EditableMap,
  shownBaseline: EditableMap,
): { patch: Record<string, DocumentOverrideValue>; changes: ChangeRow[]; errors: string[] } {
  const patch: Record<string, DocumentOverrideValue> = {};
  const changes: ChangeRow[] = [];
  const errors: string[] = [];

  for (const key of DOCUMENT_OVERRIDE_KEYS) {
    if (MULTISELECT_KEYS.has(key)) {
      const nextArr = Array.isArray(current[key]) ? (current[key] as string[]) : [];
      const prevArr = Array.isArray(shownBaseline[key]) ? (shownBaseline[key] as string[]) : [];
      if (arraysEqualUnordered(nextArr, prevArr)) continue;
      patch[key] = nextArr;
      changes.push({
        key,
        label: labelForKey(key),
        before: formatValueForDisplay(key, prevArr),
        after: formatValueForDisplay(key, nextArr),
      });
      continue;
    }

    const nextStr = typeof current[key] === "string" ? (current[key] as string).trim() : "";
    const prevStr = typeof shownBaseline[key] === "string" ? (shownBaseline[key] as string).trim() : "";
    if (nextStr === prevStr) continue;

    if (key === "waterSourceLatitude" || key === "waterSourceLongitude") {
      if (!nextStr) {
        // Clearing a coordinate is treated as "revert to base"; we don't
        // support that in this editor yet, so skip with a friendly error.
        errors.push(`${labelForKey(key)} cannot be empty.`);
        continue;
      }
      const parsed = Number(nextStr);
      if (!Number.isFinite(parsed)) {
        errors.push(`${labelForKey(key)} must be a number.`);
        continue;
      }
      patch[key] = parsed;
    } else {
      if (!nextStr) {
        errors.push(`${labelForKey(key)} cannot be empty.`);
        continue;
      }
      patch[key] = nextStr;
    }

    changes.push({
      key,
      label: labelForKey(key),
      before: prevStr || "—",
      after: nextStr,
    });
  }

  return { patch, changes, errors };
}

export function DocumentValuesEditor({
  applicationId,
  application,
  readOnly = false,
  onInternalNotesChange,
  onSaved,
}: DocumentValuesEditorProps) {
  // Effective baseline = override > underlying default. This is what the user
  // sees prefilled in the inputs, and what we diff against to compute the patch.
  const initialEffective = useMemo(() => getEffectiveDocumentValues(application), [application]);
  const initialEnvelope = useMemo(
    () => getDocumentOverrideEnvelopeFromNotes(application.internal_notes),
    [application.internal_notes],
  );

  const [version, setVersion] = useState(initialEnvelope.version);
  const [shownBaseline, setShownBaseline] = useState<EditableMap>(() => toEditableMap(initialEffective));
  const [values, setValues] = useState<EditableMap>(() => toEditableMap(initialEffective));

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  // When the user navigates to a different application, fully reset the
  // editor (including any in-progress drafts and save state).
  useEffect(() => {
    const nextEffective = getEffectiveDocumentValues(application);
    const nextEnvelope = getDocumentOverrideEnvelopeFromNotes(application.internal_notes);
    setVersion(nextEnvelope.version);
    setShownBaseline(toEditableMap(nextEffective));
    setValues(toEditableMap(nextEffective));
    setSaveState("idle");
    setErrorMessage(null);
    // We deliberately key on applicationId only — the nested effect below
    // handles in-place updates without clobbering in-progress drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  // When the parent updates `application.internal_notes` for the *same*
  // application (e.g. the assessor just saved a different field like the
  // permit duration), re-sync the baseline + version so a subsequent save
  // sends the right concurrency token. We intentionally do NOT touch
  // `values` here so any in-progress drafts the user is typing are kept.
  useEffect(() => {
    const nextEffective = getEffectiveDocumentValues(application);
    const nextEnvelope = getDocumentOverrideEnvelopeFromNotes(application.internal_notes);
    setVersion(nextEnvelope.version);
    setShownBaseline(toEditableMap(nextEffective));
  }, [application]);

  const { patch, changes, errors: validationErrors } = useMemo(
    () => buildPatch(values, shownBaseline),
    [values, shownBaseline],
  );

  const hasChanges = changes.length > 0;
  const canSave = !readOnly && hasChanges && validationErrors.length === 0 && saveState !== "saving";

  const setFieldValue = (key: DocumentOverrideKey, next: string | string[]) => {
    setValues((prev) => ({ ...prev, [key]: next }));
    if (saveState === "saved") setSaveState("idle");
  };

  const discardChanges = () => {
    setValues(shownBaseline);
    setSaveState("idle");
    setErrorMessage(null);
  };

  const performSave = async () => {
    setSaveState("saving");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/staff/applications/${applicationId}/document-overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, patch }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 409 && body?.currentVersion != null) {
          // Concurrency: pull server's latest, re-baseline so the assessor can
          // re-apply changes against fresh state.
          const nextVersion = Number(body.currentVersion);
          const serverValues =
            body?.values && typeof body.values === "object" ? (body.values as DocumentOverrideValues) : {};
          const merged = getEffectiveDocumentValues({
            ...application,
            internal_notes: JSON.stringify({
              ...parseInternalNotes(application.internal_notes),
              document_overrides: { version: nextVersion, values: serverValues },
            }),
          });
          setVersion(nextVersion);
          setShownBaseline(toEditableMap(merged));
          setValues(toEditableMap(merged));
          throw new Error(
            "Another assessor updated these values while you were editing. The latest saved values were loaded — please re-apply your changes.",
          );
        }
        throw new Error(
          body?.message && typeof body.message === "string"
            ? body.message
            : `Save failed (${res.status})`,
        );
      }

      const envelope = body?.document_overrides as DocumentOverrideEnvelope | undefined;
      if (!envelope || typeof envelope !== "object") {
        throw new Error("Invalid save response");
      }

      // Merge new envelope into internal_notes and notify the parent so it can
      // re-derive `application.internal_notes`. The effect above will then
      // re-baseline the inputs to the new effective values.
      const nextNotes = parseInternalNotes(application.internal_notes);
      nextNotes.document_overrides = envelope;
      const nextNotesJson = JSON.stringify(nextNotes);

      setVersion(envelope.version);
      const nextEffective = getEffectiveDocumentValues({ ...application, internal_notes: nextNotesJson });
      setShownBaseline(toEditableMap(nextEffective));
      setValues(toEditableMap(nextEffective));
      setSaveState("saved");

      onInternalNotesChange?.(nextNotesJson);
      onSavedRef.current?.();
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to save changes");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Permit & Contract Dynamic Values</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {DOCUMENT_OVERRIDE_FIELD_GROUPS.map((group) => (
          <div key={group.id} className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">{group.label}</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {group.fields.map((field) => {
                if (field.kind === "multiselect") {
                  const selected = (values[field.key] as string[]) ?? [];
                  return (
                    <div
                      key={field.key}
                      className="space-y-1.5 md:col-span-2"
                    >
                      <Label htmlFor={`document-override-${field.key}`}>
                        {field.label}
                      </Label>
                      <MultiSelectChips
                        id={`document-override-${field.key}`}
                        options={field.options}
                        selected={selected}
                        disabled={readOnly}
                        placeholder={field.placeholder ?? "Select one or more"}
                        onChange={(next) => setFieldValue(field.key, next)}
                      />
                    </div>
                  );
                }
                const textValue = (values[field.key] as string) ?? "";
                return (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`document-override-${field.key}`}>{field.label}</Label>
                    <Input
                      id={`document-override-${field.key}`}
                      type={field.kind === "number" ? "number" : "text"}
                      inputMode={field.kind === "number" ? "decimal" : undefined}
                      placeholder={field.placeholder}
                      value={textValue}
                      disabled={readOnly}
                      onChange={(e) => setFieldValue(field.key, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {validationErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <ul className="list-disc list-inside space-y-1">
                {validationErrors.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {saveState === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage ?? "Failed to save document values."}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="flex items-center gap-2 text-sm">
            {saveState === "saving" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Saving changes…</span>
              </>
            )}
            {saveState === "saved" && (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-green-700">Saved — preview refreshed.</span>
              </>
            )}
            {saveState === "idle" && hasChanges && (
              <span className="text-amber-700">
                {changes.length} unsaved change{changes.length === 1 ? "" : "s"}.
              </span>
            )}
            {saveState === "idle" && !hasChanges && (
              <span className="text-muted-foreground">
                Edit any value and click <span className="font-medium">Save changes</span> to update the permit and contract.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasChanges && saveState !== "saving" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={discardChanges}
                disabled={readOnly}
              >
                <X className="h-4 w-4 mr-1.5" />
                Discard
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={!canSave}
            >
              {saveState === "saving" ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              Save changes
            </Button>
          </div>
        </div>
      </CardContent>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (saveState === "saving") return;
          setConfirmOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save these changes?</AlertDialogTitle>
            <AlertDialogDescription>
              These values will be used in the generated permit and contract. The
              permit preview will refresh after saving.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm">
            {changes.length === 0 ? (
              <p className="text-muted-foreground">No changes to save.</p>
            ) : (
              <ul className="space-y-2">
                {changes.map((row) => (
                  <li key={row.key} className="space-y-0.5">
                    <p className="font-medium text-foreground">{row.label}</p>
                    <p className="text-xs">
                      <span className="text-muted-foreground line-through mr-2">{row.before}</span>
                      <span className="text-foreground">→ {row.after}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveState === "saving"}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canSave}
              onClick={async (e) => {
                e.preventDefault();
                await performSave();
                setConfirmOpen(false);
              }}
            >
              {saveState === "saving" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Yes, save changes"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

type MultiSelectChipsProps = {
  id: string;
  options: { value: string; label: string }[];
  selected: string[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (next: string[]) => void;
};

/**
 * Lightweight multi-select rendered as a list of chips with a "+ Add" picker.
 * Avoids pulling in a heavy combobox dependency while staying keyboard-friendly.
 */
function MultiSelectChips({
  id,
  options,
  selected,
  disabled,
  placeholder,
  onChange,
}: MultiSelectChipsProps) {
  const labelByValue = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) m.set(o.value, o.label);
    return m;
  }, [options]);

  const remaining = useMemo(
    () => options.filter((o) => !selected.includes(o.value)),
    [options, selected],
  );

  const remove = (val: string) => {
    if (disabled) return;
    onChange(selected.filter((s) => s !== val));
  };

  const add = (val: string) => {
    if (disabled || !val) return;
    if (selected.includes(val)) return;
    onChange([...selected, val]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background p-2 min-h-[40px]">
        {selected.length === 0 && (
          <span className="text-sm text-muted-foreground self-center px-1">
            {placeholder}
          </span>
        )}
        {selected.map((val) => (
          <Badge
            key={val}
            variant="secondary"
            className="gap-1 pl-2 pr-1 py-1 text-xs font-normal"
          >
            {labelByValue.get(val) ?? val}
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${labelByValue.get(val) ?? val}`}
                onClick={() => remove(val)}
                className="rounded-sm hover:bg-muted-foreground/20 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
      </div>
      {!disabled && remaining.length > 0 && (
        <select
          id={id}
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) add(v);
            e.currentTarget.value = "";
          }}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">+ Add activity…</option>
          {remaining.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
