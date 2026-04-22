"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DOCUMENT_OVERRIDE_FIELD_GROUPS,
  DOCUMENT_OVERRIDE_KEYS,
  type DocumentOverrideEnvelope,
  type DocumentOverrideKey,
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
};

function normalizeForCompare(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toEditableValueMap(values: DocumentOverrideValues): Record<DocumentOverrideKey, string> {
  const next = {} as Record<DocumentOverrideKey, string>;
  for (const key of DOCUMENT_OVERRIDE_KEYS) {
    const value = values[key];
    next[key] = value === undefined ? "" : String(value);
  }
  return next;
}

function diffPatch(
  current: Record<DocumentOverrideKey, string>,
  baseline: DocumentOverrideValues,
): Record<string, string | number> {
  const patch: Record<string, string | number> = {};
  for (const key of DOCUMENT_OVERRIDE_KEYS) {
    const nextRaw = current[key].trim();
    const prevRaw = normalizeForCompare(baseline[key]);
    if (nextRaw === prevRaw) continue;
    if (!nextRaw) continue;
    if (key === "waterSourceLatitude" || key === "waterSourceLongitude") {
      const parsed = Number(nextRaw);
      patch[key] = Number.isFinite(parsed) ? parsed : nextRaw;
    } else {
      patch[key] = nextRaw;
    }
  }
  return patch;
}

export function DocumentValuesEditor({
  applicationId,
  internalNotes,
  readOnly = false,
  onInternalNotesChange,
}: DocumentValuesEditorProps) {
  const initialEnvelope = useMemo(
    () => getDocumentOverrideEnvelopeFromNotes(internalNotes),
    [internalNotes],
  );
  const [version, setVersion] = useState(initialEnvelope.version);
  const [values, setValues] = useState<Record<DocumentOverrideKey, string>>(
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

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

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
              {group.fields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`document-override-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`document-override-${field.key}`}
                    type={field.kind === "number" ? "number" : "text"}
                    inputMode={field.kind === "number" ? "decimal" : undefined}
                    placeholder={field.placeholder}
                    value={values[field.key]}
                    disabled={readOnly}
                    onChange={(e) => {
                      const next = e.target.value;
                      setValues((prev) => ({ ...prev, [field.key]: next }));
                    }}
                  />
                </div>
              ))}
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
