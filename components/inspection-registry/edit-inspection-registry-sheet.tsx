"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InspectionRegistryEntry } from "@/hooks/useInspectionRegistryQuery";

/** "auto" stores NULL — compliance is then derived from the action at read time. */
type ComplianceChoice = "auto" | "Complying" | "Not complying";

type FieldErrors = Partial<Record<"permit_holder", string>>;

interface EditFormState {
  permit_holder: string;
  permit_number: string;
  activity: string;
  district: string;
  inspection_date_text: string;
  compliance_status: ComplianceChoice;
  action: string;
  observation: string;
}

interface EditInspectionRegistrySheetProps {
  entry: InspectionRegistryEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    id: string,
    expectedUpdatedAt: string,
    updates: Record<string, string | null>
  ) => Promise<void>;
  saving: boolean;
  /** Rendered below the form — the row's document upload/delete panel. */
  documents?: ReactNode;
}

function asInput(value: string | null | undefined): string {
  return value == null ? "" : String(value);
}

function toComplianceChoice(value: string | null | undefined): ComplianceChoice {
  const lower = (value || "").trim().toLowerCase();
  if (lower === "complying") return "Complying";
  if (lower.startsWith("not")) return "Not complying";
  return "auto";
}

function toNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function EditInspectionRegistrySheet({
  entry,
  open,
  onOpenChange,
  onSave,
  saving,
  documents,
}: EditInspectionRegistrySheetProps) {
  const [form, setForm] = useState<EditFormState>({
    permit_holder: "",
    permit_number: "",
    activity: "",
    district: "",
    inspection_date_text: "",
    compliance_status: "auto",
    action: "",
    observation: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setForm({
      permit_holder: asInput(entry.permit_holder),
      permit_number: asInput(entry.permit_number),
      activity: asInput(entry.activity),
      district: asInput(entry.district),
      inspection_date_text: asInput(entry.inspection_date_text),
      compliance_status: toComplianceChoice(entry.compliance_status),
      action: asInput(entry.action),
      observation: asInput(entry.observation),
    });
    setErrors({});
    setShowConfirm(false);
  }, [entry, open]);

  const parsed = useMemo(
    () => ({
      permit_holder: toNullableText(form.permit_holder),
      permit_number: toNullableText(form.permit_number),
      activity: toNullableText(form.activity),
      district: toNullableText(form.district),
      inspection_date_text: toNullableText(form.inspection_date_text),
      compliance_status: form.compliance_status === "auto" ? null : form.compliance_status,
      action: toNullableText(form.action),
      observation: toNullableText(form.observation),
    }),
    [form]
  );

  const original = useMemo(() => {
    if (!entry) return null;
    const compliance = toComplianceChoice(entry.compliance_status);
    return {
      permit_holder: entry.permit_holder ?? null,
      permit_number: entry.permit_number ?? null,
      activity: entry.activity ?? null,
      district: entry.district ?? null,
      inspection_date_text: entry.inspection_date_text ?? null,
      compliance_status: compliance === "auto" ? null : compliance,
      action: entry.action ?? null,
      observation: entry.observation ?? null,
    };
  }, [entry]);

  const changedEntries = useMemo(() => {
    if (!original) return [];
    return (Object.keys(parsed) as Array<keyof typeof parsed>)
      .filter((key) => parsed[key] !== original[key])
      .map((key) => ({ key, before: original[key], after: parsed[key] }));
  }, [parsed, original]);

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!parsed.permit_holder) next.permit_holder = "Permit holder is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSaveClick = () => {
    if (!validate()) return;
    if (changedEntries.length === 0) return;
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    if (!entry || !entry.updated_at) return;
    const payload = Object.fromEntries(changedEntries.map((change) => [change.key, change.after]));
    await onSave(entry.id, entry.updated_at, payload);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit inspection record</SheetTitle>
          <SheetDescription>
            {entry?.inspection_number || "Registry entry"} — Water Users Inspection Register
            {entry?.source_kind === "system" ? " (system inspection)" : " (imported)"}
          </SheetDescription>
        </SheetHeader>

        {!showConfirm ? (
          <div className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <Field
                label="Permit holder"
                value={form.permit_holder}
                onChange={(value) => setForm((prev) => ({ ...prev, permit_holder: value }))}
                error={errors.permit_holder}
              />
              <Field
                label="Permit number"
                value={form.permit_number}
                onChange={(value) => setForm((prev) => ({ ...prev, permit_number: value }))}
              />
              <Field
                label="Activity"
                value={form.activity}
                onChange={(value) => setForm((prev) => ({ ...prev, activity: value }))}
              />
              <Field
                label="Location (District)"
                value={form.district}
                onChange={(value) => setForm((prev) => ({ ...prev, district: value }))}
              />
              <Field
                label="Inspection date"
                value={form.inspection_date_text}
                onChange={(value) => setForm((prev) => ({ ...prev, inspection_date_text: value }))}
                placeholder="e.g. 13-17 June 2022"
              />
              <div className="space-y-1.5">
                <Label>Action / Recommendation</Label>
                <Textarea
                  value={form.action}
                  onChange={(event) => setForm((prev) => ({ ...prev, action: event.target.value }))}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Compliance status</Label>
                <Select
                  value={form.compliance_status}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, compliance_status: value as ComplianceChoice }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Compliance" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto — derive from the action</SelectItem>
                    <SelectItem value="Complying">Complying</SelectItem>
                    <SelectItem value="Not complying">Not complying</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  &quot;Auto&quot; derives compliance from the recorded action (&quot;No
                  action...&quot; = Complying). Changing the action above also switches this row
                  back to auto unless you pick an explicit status.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Observation / Comments</Label>
                <Textarea
                  value={form.observation}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, observation: event.target.value }))
                  }
                  rows={4}
                />
              </div>
            </div>
            {documents}
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-3 text-sm">
            <p className="text-muted-foreground">Are you sure you want to save these changes?</p>
            <div className="rounded-md border p-3 max-h-64 overflow-auto">
              {changedEntries.map((change) => (
                <p key={String(change.key)} className="mb-1 last:mb-0">
                  <span className="font-medium">{change.key}</span>:{" "}
                  <span className="text-muted-foreground">{String(change.before ?? "empty")}</span>
                  {" -> "}
                  <span>{String(change.after ?? "empty")}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        <SheetFooter>
          {showConfirm ? (
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowConfirm(false)}
                disabled={saving}
              >
                Back
              </Button>
              <Button className="flex-1" onClick={handleConfirm} disabled={saving}>
                {saving ? "Saving..." : "Confirm save"}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveClick}
                disabled={saving || changedEntries.length === 0}
              >
                Save changes
              </Button>
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={error ? "border-red-500 focus-visible:ring-red-500" : ""}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
