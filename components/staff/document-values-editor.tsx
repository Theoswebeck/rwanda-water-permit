"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import {
  DOCUMENT_OVERRIDE_FIELD_GROUPS,
  DOCUMENT_OVERRIDE_KEYS,
  type DocumentOverrideEnvelope,
  type DocumentOverrideKey,
  type DocumentOverrideValue,
  type DocumentOverrideValues,
  getDocumentOverrideEnvelopeFromNotes,
  parseInternalNotes,
} from "@/lib/document-overrides";

type SaveState = "idle" | "saving" | "saved" | "error";

type DocumentValuesEditorProps = {
  applicationId: string;
  internalNotes?: string | null;
  readOnly?: boolean;
  onInternalNotesChange?: (nextInternalNotes: string) => void;
  /** Called after each successful save so the parent can refresh the permit preview. */
  onSaved?: () => void;
};

const MULTISELECT_KEYS = new Set<DocumentOverrideKey>(["intendedActivities"]);

type EditableMap = Record<DocumentOverrideKey, string | string[]>;

function defaultForKey(key: DocumentOverrideKey): string | string[] {
  return MULTISELECT_KEYS.has(key) ? [] : "";
}

function normalizeForCompare(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean).sort().join("|");
  return String(value).trim();
}

function toEditableValueMap(values: DocumentOverrideValues): EditableMap {
  const next = {} as EditableMap;
  for (const key of DOCUMENT_OVERRIDE_KEYS) {
    const value = values[key];
    if (MULTISELECT_KEYS.has(key)) {
      next[key] = Array.isArray(value) ? value.map(String) : [];
    } else {
      next[key] = value === undefined ? "" : String(value);
    }
  }
  return next;
}

function diffPatch(
  current: EditableMap,
  baseline: DocumentOverrideValues,
): Record<string, DocumentOverrideValue> {
  const patch: Record<string, DocumentOverrideValue> = {};
  for (const key of DOCUMENT_OVERRIDE_KEYS) {
    const nextRaw = current[key];

    if (MULTISELECT_KEYS.has(key)) {
      const nextArr = Array.isArray(nextRaw) ? nextRaw.map(String) : [];
      const prevArr = Array.isArray(baseline[key])
        ? (baseline[key] as string[]).map(String)
        : [];
      const nextKey = [...nextArr].sort().join("|");
      const prevKey = [...prevArr].sort().join("|");
      if (nextKey === prevKey) continue;
      patch[key] = nextArr;
      continue;
    }

    const nextStr = typeof nextRaw === "string" ? nextRaw.trim() : "";
    const prevStr = normalizeForCompare(baseline[key]);
    if (nextStr === prevStr) continue;
    if (!nextStr) continue;
    if (key === "waterSourceLatitude" || key === "waterSourceLongitude") {
      const parsed = Number(nextStr);
      patch[key] = Number.isFinite(parsed) ? parsed : nextStr;
    } else {
      patch[key] = nextStr;
    }
  }
  return patch;
}

export function DocumentValuesEditor({
  applicationId,
  internalNotes,
  readOnly = false,
  onInternalNotesChange,
  onSaved,
}: DocumentValuesEditorProps) {
  const initialEnvelope = useMemo(
    () => getDocumentOverrideEnvelopeFromNotes(internalNotes),
    [internalNotes],
  );
  const [version, setVersion] = useState(initialEnvelope.version);
  const [values, setValues] = useState<EditableMap>(
    toEditableValueMap(initialEnvelope.values),
  );
  const [saveCycle, setSaveCycle] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const pendingResaveRef = useRef(false);
  const valuesRef = useRef(values);
  const baselineRef = useRef<DocumentOverrideValues>(initialEnvelope.values);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    const envelope = getDocumentOverrideEnvelopeFromNotes(internalNotes);
    setVersion(envelope.version);
    setValues(toEditableValueMap(envelope.values));
    baselineRef.current = envelope.values;
    setSaveState("idle");
    setErrorMessage(null);
  }, [applicationId, internalNotes]);

  useEffect(() => {
    if (readOnly) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const patch = diffPatch(valuesRef.current, baselineRef.current);
    if (Object.keys(patch).length === 0) {
      if (saveState === "saved") return;
      setSaveState("idle");
      return;
    }

    saveTimerRef.current = setTimeout(async () => {
      if (inFlightRef.current) {
        pendingResaveRef.current = true;
        return;
      }
      inFlightRef.current = true;
      pendingResaveRef.current = false;
      setSaveState("saving");
      setErrorMessage(null);
      try {
        const res = await fetch(`/api/staff/applications/${applicationId}/document-overrides`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version,
            patch,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          if (res.status === 409 && body?.currentVersion != null) {
            const nextVersion = Number(body.currentVersion);
            const serverValues =
              body?.values && typeof body.values === "object" ? (body.values as DocumentOverrideValues) : {};
            setVersion(nextVersion);
            baselineRef.current = serverValues;
            setValues(toEditableValueMap(serverValues));
            pendingResaveRef.current = false;
            throw new Error(
              "Another assessor updated these values. Latest saved values were loaded; please re-apply your changes.",
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

        setVersion(envelope.version);
        baselineRef.current = envelope.values ?? {};
        const stillDirty = diffPatch(valuesRef.current, baselineRef.current);
        if (Object.keys(stillDirty).length > 0) {
          pendingResaveRef.current = true;
          setSaveState("idle");
        } else {
          setSaveState("saved");
          const nextNotes = parseInternalNotes(internalNotes);
          nextNotes.document_overrides = envelope;
          onInternalNotesChange?.(JSON.stringify(nextNotes));
          // Notify parent so it can refresh the permit preview iframe.
          onSavedRef.current?.();
        }
      } catch (err) {
        setSaveState("error");
        setErrorMessage(err instanceof Error ? err.message : "Failed to save changes");
      } finally {
        inFlightRef.current = false;
        if (pendingResaveRef.current) {
          pendingResaveRef.current = false;
          setSaveCycle((v) => v + 1);
        }
      }
    }, 700);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [applicationId, internalNotes, readOnly, saveCycle, saveState, values, version, onInternalNotesChange]);

  const setFieldValue = (key: DocumentOverrideKey, next: string | string[]) => {
    setValues((prev) => ({ ...prev, [key]: next }));
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
                      onChange={(e) => {
                        setFieldValue(field.key, e.target.value);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-2 text-sm">
          {saveState === "saving" && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Saving changes...</span>
            </>
          )}
          {saveState === "saved" && (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-green-700">Saved</span>
            </>
          )}
          {saveState === "idle" && (
            <span className="text-muted-foreground">Edit values to update both preview and final permit.</span>
          )}
        </div>

        {saveState === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage ?? "Failed to save document values."}</AlertDescription>
          </Alert>
        )}
      </CardContent>
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
