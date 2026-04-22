"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { PermitRegistryEntry } from "@/types/database";

type FieldErrors = Partial<Record<keyof EditFormState, string>>;

interface EditFormState {
  permit_holder: string;
  permit_number: string;
  regime: string;
  water_source: string;
  volume_or_area: string;
  method_of_water_taking: string;
  authorized_activity: string;
  location: string;
  latitude: string;
  longitude: string;
  issuance_date: string;
  duration: string;
  expiration_date: string;
  status: string;
  contact: string;
}

interface EditRegistryDrawerProps {
  entry: PermitRegistryEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    id: string,
    expectedUpdatedAt: string,
    updates: Record<string, string | number | null>
  ) => Promise<void>;
  saving: boolean;
}

function asInput(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value);
}

function normalizeDate(value: string | null | undefined): string {
  if (!value) return "";
  return value.length >= 10 ? value.slice(0, 10) : value;
}

function toNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function EditRegistryDrawer({
  entry,
  open,
  onOpenChange,
  onSave,
  saving,
}: EditRegistryDrawerProps) {
  const [form, setForm] = useState<EditFormState>({
    permit_holder: "",
    permit_number: "",
    regime: "",
    water_source: "",
    volume_or_area: "",
    method_of_water_taking: "",
    authorized_activity: "",
    location: "",
    latitude: "",
    longitude: "",
    issuance_date: "",
    duration: "",
    expiration_date: "",
    status: "",
    contact: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setForm({
      permit_holder: asInput(entry.permit_holder),
      permit_number: asInput(entry.permit_number),
      regime: asInput(entry.regime),
      water_source: asInput(entry.water_source),
      volume_or_area: asInput(entry.volume_or_area),
      method_of_water_taking: asInput(entry.method_of_water_taking),
      authorized_activity: asInput(entry.authorized_activity),
      location: asInput(entry.location),
      latitude: asInput(entry.latitude),
      longitude: asInput(entry.longitude),
      issuance_date: normalizeDate(entry.issuance_date),
      duration: asInput(entry.duration),
      expiration_date: normalizeDate(entry.expiration_date),
      status: asInput(entry.status),
      contact: asInput(entry.contact),
    });
    setErrors({});
    setShowConfirm(false);
  }, [entry, open]);

  const parsed = useMemo(() => {
    return {
      permit_holder: toNullableText(form.permit_holder),
      permit_number: toNullableText(form.permit_number),
      regime: toNullableText(form.regime),
      water_source: toNullableText(form.water_source),
      volume_or_area: toNullableText(form.volume_or_area),
      method_of_water_taking: toNullableText(form.method_of_water_taking),
      authorized_activity: toNullableText(form.authorized_activity),
      location: toNullableText(form.location),
      latitude: toNullableNumber(form.latitude),
      longitude: toNullableNumber(form.longitude),
      issuance_date: toNullableText(form.issuance_date),
      duration: toNullableText(form.duration),
      expiration_date: toNullableText(form.expiration_date),
      status: toNullableText(form.status),
      contact: toNullableText(form.contact),
    };
  }, [form]);

  const original = useMemo(() => {
    if (!entry) return null;
    return {
      permit_holder: entry.permit_holder ?? null,
      permit_number: entry.permit_number ?? null,
      regime: entry.regime ?? null,
      water_source: entry.water_source ?? null,
      volume_or_area: entry.volume_or_area ?? null,
      method_of_water_taking: entry.method_of_water_taking ?? null,
      authorized_activity: entry.authorized_activity ?? null,
      location: entry.location ?? null,
      latitude: entry.latitude ?? null,
      longitude: entry.longitude ?? null,
      issuance_date: normalizeDate(entry.issuance_date) || null,
      duration: entry.duration ?? null,
      expiration_date: normalizeDate(entry.expiration_date) || null,
      status: entry.status ?? null,
      contact: entry.contact ?? null,
    };
  }, [entry]);

  const changedEntries = useMemo(() => {
    if (!original) return [];
    return (Object.keys(parsed) as Array<keyof typeof parsed>)
      .filter((key) => parsed[key] !== original[key])
      .map((key) => ({
        key,
        before: original[key],
        after: parsed[key],
      }));
  }, [parsed, original]);

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!parsed.permit_holder) next.permit_holder = "Permit holder is required";
    if (!parsed.permit_number) next.permit_number = "Permit number is required";
    if (form.latitude.trim() && parsed.latitude == null) next.latitude = "Latitude must be a valid number";
    if (form.longitude.trim() && parsed.longitude == null) next.longitude = "Longitude must be a valid number";
    if (parsed.latitude != null && (parsed.latitude < -90 || parsed.latitude > 90)) next.latitude = "Latitude must be between -90 and 90";
    if (parsed.longitude != null && (parsed.longitude < -180 || parsed.longitude > 180)) next.longitude = "Longitude must be between -180 and 180";
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
          <SheetTitle>Edit permit row</SheetTitle>
          <SheetDescription>
            {entry?.permit_number || "Registry entry"}
          </SheetDescription>
        </SheetHeader>

        {!showConfirm ? (
          <div className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <Field label="Permit holder" value={form.permit_holder} onChange={(value) => setForm((prev) => ({ ...prev, permit_holder: value }))} error={errors.permit_holder} />
              <Field label="Permit number" value={form.permit_number} onChange={(value) => setForm((prev) => ({ ...prev, permit_number: value }))} error={errors.permit_number} />
              <Field label="Regime" value={form.regime} onChange={(value) => setForm((prev) => ({ ...prev, regime: value }))} />
              <Field label="Status" value={form.status} onChange={(value) => setForm((prev) => ({ ...prev, status: value }))} />
              <Field label="Water source" value={form.water_source} onChange={(value) => setForm((prev) => ({ ...prev, water_source: value }))} />
              <Field label="Volume or area" value={form.volume_or_area} onChange={(value) => setForm((prev) => ({ ...prev, volume_or_area: value }))} />
              <Field label="Method of water taking" value={form.method_of_water_taking} onChange={(value) => setForm((prev) => ({ ...prev, method_of_water_taking: value }))} />
              <Field label="Authorized activity" value={form.authorized_activity} onChange={(value) => setForm((prev) => ({ ...prev, authorized_activity: value }))} />
              <Field label="Location" value={form.location} onChange={(value) => setForm((prev) => ({ ...prev, location: value }))} />
              <Field label="Latitude" value={form.latitude} onChange={(value) => setForm((prev) => ({ ...prev, latitude: value }))} error={errors.latitude} />
              <Field label="Longitude" value={form.longitude} onChange={(value) => setForm((prev) => ({ ...prev, longitude: value }))} error={errors.longitude} />
              <Field label="Issuance date" value={form.issuance_date} onChange={(value) => setForm((prev) => ({ ...prev, issuance_date: value }))} type="date" />
              <Field label="Duration" value={form.duration} onChange={(value) => setForm((prev) => ({ ...prev, duration: value }))} />
              <Field label="Expiration date" value={form.expiration_date} onChange={(value) => setForm((prev) => ({ ...prev, expiration_date: value }))} type="date" />
              <Field label="Contact" value={form.contact} onChange={(value) => setForm((prev) => ({ ...prev, contact: value }))} />
            </div>
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-3 text-sm">
            <p className="text-muted-foreground">
              Are you sure you want to save these changes?
            </p>
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
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)} disabled={saving}>
                Back
              </Button>
              <Button className="flex-1" onClick={handleConfirm} disabled={saving}>
                {saving ? "Saving..." : "Confirm save"}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSaveClick} disabled={saving || changedEntries.length === 0}>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={error ? "border-red-500 focus-visible:ring-red-500" : ""}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
