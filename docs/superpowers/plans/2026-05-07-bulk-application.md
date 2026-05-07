# Bulk Application Process — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bulk water permit application flow for flagged accounts (e.g., WASAC), covering the full pipeline: application form → assessment → contract/permit PDF → permit registry.

**Architecture:** Single `is_bulk_applicant` flag on users drives a `bulk_water_supply` permit variant; one parent permit + N child permits are created at terms acceptance; one parent PDF covers all networks via an annex table.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL (postgres.ts query helper), Supabase (client-side auth/storage), PDFKit (server-side PDF), shadcn/ui components.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `database/migrations/2026-05-07-bulk-application.sql` | Create | 3 schema migrations (users, applications, permits) |
| `types/database.ts` | Modify | Add BulkNetworkRow, update User/Application/Permit interfaces |
| `lib/permit-variant.ts` | Modify | Add `bulk_water_supply` variant, check `is_bulk` first |
| `lib/permit-number-utils.ts` | Modify | Parse child permit format `000918_1/RWB/2026` |
| `components/dashboard/bulk-networks-table.tsx` | Create | Shared table: editable (form), assessor (edit values), readonly |
| `components/dashboard/application-form.tsx` | Modify | Add `isBulkApplicant` prop, bulk district + network table, skip land ownership |
| `app/dashboard/new-application/page.tsx` | Modify | Pass `is_bulk_applicant` from userProfile to form |
| `app/api/staff/applications/[id]/assessor-adjustments/route.ts` | Modify | Add `bulkNetworks` field to adjustments patch |
| `components/inspection/assessment-report-form.tsx` | Modify | Add network rows section (edit values only) for bulk apps |
| `app/dashboard/application/[id]/terms/page.tsx` | Modify | Bulk permit generation: parent + child inserts in loop |
| `lib/pdf-permit-server.ts` | Modify | Add `renderBulkWaterSupply()` with bilingual body + annex table |
| `lib/contract-terms.ts` | Modify | Add `bulk_water_supply` contract template with annex |
| `lib/permit/public-permit-query.ts` | Modify | Return child network rows + parent info for bulk permits |
| `app/permit/view/[...permitNumber]/page.tsx` | Modify | Show annex table when permit has children |
| `components/admin/user-management.tsx` | Modify | Add `is_bulk_applicant` toggle in user edit form |
| Various staff list components | Modify | Add BULK badge |

---

## Task 1: Database Migration + TypeScript Types

**Files:**
- Create: `database/migrations/2026-05-07-bulk-application.sql`
- Modify: `types/database.ts`

- [ ] **Step 1: Create migration file**

```sql
-- database/migrations/2026-05-07-bulk-application.sql

-- 1. users: flag for bulk applicants
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_bulk_applicant boolean NOT NULL DEFAULT false;

-- 2. applications: bulk flag + network rows array
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS is_bulk boolean NOT NULL DEFAULT false;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS bulk_networks jsonb;

-- 3. permits: parent/child relationship
ALTER TABLE public.permits ADD COLUMN IF NOT EXISTS parent_permit_id uuid REFERENCES public.permits(id);
ALTER TABLE public.permits ADD COLUMN IF NOT EXISTS network_sequence_index integer;
```

- [ ] **Step 2: Add BulkNetworkRow type and update interfaces in `types/database.ts`**

After the `VerificationStatus` type (line ~126), add:

```typescript
export interface BulkNetworkRow {
  number: number;
  network_name: string;
  sector: string;
  cell: string;
  village?: string;
  coordinates?: string;
  capacity_m3_day?: number;
  abstraction_method?: string;
}
```

In `User` interface add after `profile_completed`:
```typescript
  is_bulk_applicant?: boolean;
```

In `Application` interface add after `payment_waived`:
```typescript
  is_bulk?: boolean;
  bulk_networks?: BulkNetworkRow[];
```

In `Permit` interface add after `original_permit_id`:
```typescript
  parent_permit_id?: string;
  network_sequence_index?: number;
```

- [ ] **Step 3: Commit**

```bash
git add database/migrations/2026-05-07-bulk-application.sql types/database.ts
git commit -m "feat(bulk): db migration + TypeScript types for bulk application"
```

---

## Task 2: Permit Variant + Permit Number Utils

**Files:**
- Modify: `lib/permit-variant.ts`
- Modify: `lib/permit-number-utils.ts`

- [ ] **Step 1: Add `bulk_water_supply` variant to `lib/permit-variant.ts`**

Change the `PermitVariant` type to add the new variant:
```typescript
export type PermitVariant =
  | "abstraction_individual"
  | "abstraction_organization"
  | "concession_individual"
  | "concession_organization"
  | "bulk_water_supply"
  | "fallback_generic";
```

Update `ApplicationLike` type to accept `is_bulk`:
```typescript
type ApplicationLike = {
  is_bulk?: boolean | null;
  intended_activities?: unknown;
  internal_notes?: unknown;
  applicant?: ApplicantLike;
};
```

Update `selectPermitVariant()` — add bulk check at the very top before any other logic:
```typescript
export function selectPermitVariant(application: ApplicationLike): PermitVariant {
  // Bulk water supply check must come first
  if (application.is_bulk) return "bulk_water_supply";

  const accountType = application.applicant?.account_type ?? null;
  const isIndividual = accountType === "individual";
  const isConcession = isConcessionApplication(application);
  if (isIndividual && !isConcession) return "abstraction_individual";
  if (isIndividual && isConcession) return "concession_individual";
  if (!isIndividual && !isConcession) return "abstraction_organization";
  if (!isIndividual && isConcession) return "concession_organization";
  return "fallback_generic";
}
```

- [ ] **Step 2: Add child permit number parsing to `lib/permit-number-utils.ts`**

Add a new function after `parseSlashPermitNumber`:

```typescript
/**
 * Parses a bulk child permit number: "000918_1/RWB/2026"
 * Returns null for standard permit numbers.
 */
export function parseChildPermitNumber(
  value: string
): { parentSeq: string; index: number; year: string } | null {
  const m = value
    .trim()
    .toUpperCase()
    .match(/^(\d{1,10})_(\d+)\/RWB\/(\d{4})$/);
  if (!m) return null;
  return { parentSeq: m[1].padStart(6, "0"), index: parseInt(m[2], 10), year: m[3] };
}

/**
 * Given a parent permit number like "000918/RWB/2026" and a row index,
 * returns the child permit number "000918_1/RWB/2026".
 */
export function buildChildPermitNumber(parentPermitNumber: string, index: number): string {
  // parentPermitNumber is e.g. "000918/RWB/2026"
  const slash = parseSlashPermitNumber(parentPermitNumber);
  if (!slash) return `${parentPermitNumber}_${index}`;
  return `${slash.seq.replace(/^0+/, "").padStart(6, "0")}_${index}/RWB/${slash.year}`;
}
```

Also update `buildPermitLookupCandidates` to handle child permit numbers — add inside the function after the existing `rwbp` block:

```typescript
  // Child bulk permit: "000918_1/RWB/2026"
  const child = parseChildPermitNumber(cleaned);
  if (child) {
    variants.add(`${child.parentSeq}_${child.index}/RWB/${child.year}`);
    const seqNoPad = child.parentSeq.replace(/^0+/, "") || "0";
    variants.add(`${seqNoPad}_${child.index}/RWB/${child.year}`);
  }
```

- [ ] **Step 3: Commit**

```bash
git add lib/permit-variant.ts lib/permit-number-utils.ts
git commit -m "feat(bulk): bulk_water_supply variant + child permit number parsing"
```

---

## Task 3: Shared BulkNetworksTable Component

**Files:**
- Create: `components/dashboard/bulk-networks-table.tsx`

This component has three modes:
- `editable`: used in the application form (add/delete/edit all fields)
- `assessor`: used in assessment report (edit values only — no add/delete)
- `readonly`: used in staff views, contract preview, permit PDF annex preview

- [ ] **Step 1: Create the component**

```tsx
// components/dashboard/bulk-networks-table.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, PlusCircle } from "lucide-react";
import type { BulkNetworkRow } from "@/types/database";

const ABSTRACTION_METHODS = [
  { value: "pumping_system", label: "Abstraction by Pumping System" },
  { value: "gravity_flow", label: "Gravity Flow" },
  { value: "other", label: "Other" },
];

type Mode = "editable" | "assessor" | "readonly";

interface BulkNetworksTableProps {
  rows: BulkNetworkRow[];
  onChange?: (rows: BulkNetworkRow[]) => void;
  mode?: Mode;
}

function renumber(rows: BulkNetworkRow[]): BulkNetworkRow[] {
  return rows.map((r, i) => ({ ...r, number: i + 1 }));
}

function emptyRow(number: number): BulkNetworkRow {
  return {
    number,
    network_name: "",
    sector: "",
    cell: "",
    village: "",
    coordinates: "",
    capacity_m3_day: undefined,
    abstraction_method: "",
  };
}

export function BulkNetworksTable({
  rows,
  onChange,
  mode = "readonly",
}: BulkNetworksTableProps) {
  const isReadonly = mode === "readonly";
  const canAddDelete = mode === "editable";

  function updateRow(index: number, field: keyof BulkNetworkRow, value: unknown) {
    if (!onChange) return;
    const next = rows.map((r, i) =>
      i === index ? { ...r, [field]: value } : r
    );
    onChange(next);
  }

  function addRow() {
    if (!onChange) return;
    onChange([...rows, emptyRow(rows.length + 1)]);
  }

  function deleteRow(index: number) {
    if (!onChange) return;
    onChange(renumber(rows.filter((_, i) => i !== index)));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 w-10">#</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Network Name</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Sector</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Cell</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Village</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Coordinates</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Capacity (m³/day)</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Abstraction Method</th>
              {canAddDelete && (
                <th className="px-3 py-2 w-10" />
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-gray-200 dark:border-gray-700">
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono">{row.number}</td>
                <td className="px-3 py-2">
                  {isReadonly ? (
                    <span>{row.network_name}</span>
                  ) : (
                    <Input
                      value={row.network_name}
                      onChange={(e) => updateRow(i, "network_name", e.target.value)}
                      disabled={mode === "assessor"}
                      className="h-8 text-sm"
                      placeholder="Network name"
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isReadonly ? (
                    <span>{row.sector}</span>
                  ) : (
                    <Input
                      value={row.sector}
                      onChange={(e) => updateRow(i, "sector", e.target.value)}
                      disabled={mode === "assessor"}
                      className="h-8 text-sm"
                      placeholder="Sector"
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isReadonly ? (
                    <span>{row.cell}</span>
                  ) : (
                    <Input
                      value={row.cell}
                      onChange={(e) => updateRow(i, "cell", e.target.value)}
                      disabled={mode === "assessor"}
                      className="h-8 text-sm"
                      placeholder="Cell"
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isReadonly ? (
                    <span>{row.village}</span>
                  ) : (
                    <Input
                      value={row.village ?? ""}
                      onChange={(e) => updateRow(i, "village", e.target.value)}
                      disabled={mode === "assessor"}
                      className="h-8 text-sm"
                      placeholder="Village"
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isReadonly ? (
                    <span>{row.coordinates}</span>
                  ) : (
                    <Input
                      value={row.coordinates ?? ""}
                      onChange={(e) => updateRow(i, "coordinates", e.target.value)}
                      className="h-8 text-sm font-mono"
                      placeholder="lat, lng"
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isReadonly ? (
                    <span>{row.capacity_m3_day ?? ""}</span>
                  ) : (
                    <Input
                      type="number"
                      value={row.capacity_m3_day ?? ""}
                      onChange={(e) =>
                        updateRow(i, "capacity_m3_day", e.target.value ? Number(e.target.value) : undefined)
                      }
                      className="h-8 text-sm w-24"
                      placeholder="0"
                      min={0}
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isReadonly ? (
                    <span>
                      {ABSTRACTION_METHODS.find((m) => m.value === row.abstraction_method)?.label ??
                        row.abstraction_method}
                    </span>
                  ) : (
                    <Select
                      value={row.abstraction_method ?? ""}
                      onValueChange={(v) => updateRow(i, "abstraction_method", v)}
                    >
                      <SelectTrigger className="h-8 text-sm w-40">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        {ABSTRACTION_METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </td>
                {canAddDelete && (
                  <td className="px-2 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700"
                      onClick={() => deleteRow(i)}
                      title="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canAddDelete && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          className="flex items-center gap-2"
        >
          <PlusCircle className="h-4 w-4" />
          Add Row
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/bulk-networks-table.tsx
git commit -m "feat(bulk): BulkNetworksTable shared component (editable/assessor/readonly)"
```

---

## Task 4: Application Form — Bulk Sections

**Files:**
- Modify: `components/dashboard/application-form.tsx`

The form receives a new `isBulkApplicant` prop. When true:
1. A district selector appears after the water source section (in the `details` tab)
2. A network rows table appears after the district selector
3. Land ownership section (tab `documents`, lines ~3813) is hidden

- [ ] **Step 1: Add `isBulkApplicant` to `ApplicationFormProps` and function signature**

Find `interface ApplicationFormProps` at line 287 and add:
```typescript
interface ApplicationFormProps {
  userData: UserData;
  onSubmit: (data: FormValues, status: 'submitted') => void | Promise<void>;
  onSaveAsDraft: (data: FormValues, status: 'draft', isAutoSave?: boolean) => void | Promise<void>;
  isLoading: boolean;
  initialData?: Partial<FormValues>;
  mode?: 'create' | 'edit';
  isBulkApplicant?: boolean;
}
```

Update function signature at line 296:
```typescript
export function ApplicationForm({ 
  userData, 
  onSubmit, 
  onSaveAsDraft, 
  isLoading, 
  initialData, 
  mode = 'create',
  isBulkApplicant = false,
}: ApplicationFormProps) {
```

- [ ] **Step 2: Add `bulkNetworks` state and `bulkDistrict` to form**

After line 305 (`const [activeTab, setActiveTab] = useState("personal");`), add:

```typescript
  const [bulkNetworks, setBulkNetworks] = useState<import("@/types/database").BulkNetworkRow[]>(
    () => {
      if (initialData && (initialData as any).bulk_networks) {
        const raw = (initialData as any).bulk_networks;
        return Array.isArray(raw) ? raw : [];
      }
      if (!isBulkApplicant) return [];
      // Default 5 empty rows
      return Array.from({ length: 5 }, (_, i) => ({
        number: i + 1,
        network_name: "",
        sector: "",
        cell: "",
        village: "",
        coordinates: "",
        capacity_m3_day: undefined,
        abstraction_method: "",
      }));
    }
  );
  const [bulkDistrict, setBulkDistrict] = useState<string>(
    () => (initialData as any)?.bulk_district ?? ""
  );
```

- [ ] **Step 3: Add import for BulkNetworksTable**

At the top of the file, after the existing imports, add:
```typescript
import { BulkNetworksTable } from "@/components/dashboard/bulk-networks-table";
import { getFormattedDistrictOptions } from "@/lib/rwanda-administrative-data";
```
(Note: `getFormattedDistrictOptions` is already imported — ensure it's not duplicated.)

- [ ] **Step 4: Expose bulk data in save/submit handlers**

Find the `handleSubmit` / `onSaveAsDraft` calls. The bulk data needs to be included in form values passed to `onSaveAsDraft` and `onSubmit`. Since `bulkNetworks` and `bulkDistrict` are outside the react-hook-form schema, inject them when calling the handlers.

Find the existing `form.handleSubmit` wrapper (around line 860-920 in page.tsx this is called from — but in the form itself the `onSubmit` and `onSaveAsDraft` are called with `values`). Wrap both callbacks in the form:

Find where `onSubmit(values, 'submitted')` is called and replace with:
```typescript
onSubmit(
  isBulkApplicant
    ? { ...values, bulk_networks: bulkNetworks, bulk_district: bulkDistrict } as any
    : values,
  'submitted'
)
```

Find where `onSaveAsDraft(values, 'draft', ...)` is called and replace with:
```typescript
onSaveAsDraft(
  isBulkApplicant
    ? { ...values, bulk_networks: bulkNetworks, bulk_district: bulkDistrict } as any
    : values,
  'draft',
  isAutoSave
)
```

- [ ] **Step 5: Add bulk district + network table to the `details` tab**

In the `details` TabsContent (after line 2799, near the end of that section, before `</TabsContent>`), add:

```tsx
{/* Bulk applicants only: district + network rows */}
{isBulkApplicant && (
  <div className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 p-6 rounded-xl border border-violet-200 dark:border-violet-800">
    <div className="flex items-center gap-3 mb-6">
      <div className="p-2 bg-violet-100 dark:bg-violet-900/40 rounded-lg">
        <Building className="h-5 w-5 text-violet-600 dark:text-violet-400" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-violet-900 dark:text-violet-100">Water Supply Networks</h3>
        <p className="text-sm text-violet-700 dark:text-violet-300">
          One application covers all networks in the selected district
        </p>
      </div>
    </div>

    {/* District selector */}
    <div className="mb-6">
      <label className="block text-sm font-medium text-violet-900 dark:text-violet-100 mb-2">
        District <span className="text-red-500">*</span>
      </label>
      <Select value={bulkDistrict} onValueChange={setBulkDistrict}>
        <SelectTrigger className="bg-white dark:bg-gray-800 max-w-xs">
          <SelectValue placeholder="Select district" />
        </SelectTrigger>
        <SelectContent>
          {getFormattedDistrictOptions("").map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    {/* Network rows table */}
    <BulkNetworksTable
      rows={bulkNetworks}
      onChange={setBulkNetworks}
      mode="editable"
    />
  </div>
)}
```

- [ ] **Step 6: Hide land ownership section for bulk applicants**

Find the land ownership section in the `documents` tab around line 3813. Wrap it:

```tsx
{!isBulkApplicant && (
  // ... existing land ownership JSX block ...
)}
```

Find the block that starts with `<Label htmlFor="landOwnershipDoc"` and wrap the entire card/section.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/application-form.tsx
git commit -m "feat(bulk): application form bulk district + network rows table"
```

---

## Task 5: new-application/page.tsx — Pass isBulkApplicant

**Files:**
- Modify: `app/dashboard/new-application/page.tsx`

- [ ] **Step 1: Pass `is_bulk_applicant` from userProfile to ApplicationForm**

Find the `userData` useMemo around line 831. Update it to include `is_bulk_applicant`:
```typescript
  const userData = useMemo(() => {
    if (!userProfile) {
      return { email: "", name: "", phone: "", address: "", idNumber: "", account_type: 'individual' as const, id_number: "", company_tin: undefined };
    }
    return {
      email: userProfile.email || "",
      name: `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() || userProfile.company_name || "",
      phone: userProfile.phone || userProfile.company_phone || "",
      address: userProfile.company_address || "",
      idNumber: userProfile.id_number || "",
      account_type: userProfile.account_type || 'individual' as const,
      id_number: userProfile.id_number || "",
      company_tin: userProfile.company_tin,
    };
  }, [userProfile]);
```

Add a derived boolean:
```typescript
  const isBulkApplicant = !!(userProfile as any)?.is_bulk_applicant;
```

- [ ] **Step 2: Pass `isBulkApplicant` to all `<ApplicationForm>` usages**

Find all `<ApplicationForm` usages (around lines 2413, 2571, 2681) and add the prop:
```tsx
<ApplicationForm
  userData={userData}
  isBulkApplicant={isBulkApplicant}
  ...
/>
```

- [ ] **Step 3: Update `mapFormDataToApplication` in `lib/application-utils.ts` to handle bulk fields**

Find `mapFormDataToApplication` at line 124 in `lib/application-utils.ts`. At the end of the returned object, add:

```typescript
  ...(formData.is_bulk !== undefined ? { is_bulk: formData.is_bulk } : {}),
  ...((formData as any).bulk_networks !== undefined
    ? { bulk_networks: (formData as any).bulk_networks }
    : {}),
```

Also, in the same function, set `is_bulk` based on whether bulk_networks is present:
```typescript
  // Set is_bulk flag if bulk_networks data present
  is_bulk: !!(formData as any).bulk_networks,
```

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/new-application/page.tsx lib/application-utils.ts
git commit -m "feat(bulk): pass isBulkApplicant to form + map bulk fields to application"
```

---

## Task 6: Assessor Adjustments API — Add bulkNetworks

**Files:**
- Modify: `app/api/staff/applications/[id]/assessor-adjustments/route.ts`

- [ ] **Step 1: Add `bulkNetworks` to the `AssessorAdjustmentsPatch` type**

Find `type AssessorAdjustmentsPatch` at the top of the file and add:
```typescript
import type { BulkNetworkRow } from "@/types/database";

type AssessorAdjustmentsPatch = {
  permitLengthYears?: number;
  recommendedVolumeM3?: number;
  waterSourceLatitude?: number;
  waterSourceLongitude?: number;
  waterSourcePolygonPoints?: Array<{ latitude: number; longitude: number }>;
  bulkNetworks?: BulkNetworkRow[];
};
```

- [ ] **Step 2: Parse and validate `bulkNetworks` from the request body**

After the existing `waterSourcePolygonPoints` block and before the "at least one field" check, add:

```typescript
    if (body.bulkNetworks !== undefined) {
      if (!Array.isArray(body.bulkNetworks)) {
        return NextResponse.json(
          { success: false, message: "bulkNetworks must be an array" },
          { status: 400 },
        );
      }
      patch.bulkNetworks = body.bulkNetworks as BulkNetworkRow[];
    }
```

Update the "at least one field" guard to include bulkNetworks:
```typescript
    if (
      patch.permitLengthYears === undefined &&
      patch.recommendedVolumeM3 === undefined &&
      patch.waterSourceLatitude === undefined &&
      patch.waterSourceLongitude === undefined &&
      patch.waterSourcePolygonPoints === undefined &&
      patch.bulkNetworks === undefined
    ) {
```

- [ ] **Step 3: Write `bulkNetworks` into `nextAdjustments` inside the transaction**

Find the block inside `withTransaction` where `nextAdjustments` is built. After the `waterSourcePolygonPoints` block, add:

```typescript
      if (patch.bulkNetworks !== undefined) {
        nextAdjustments.bulkNetworks = patch.bulkNetworks;
        nextAdjustments.bulkNetworksAdjustedAt = nowIso;
      }
```

- [ ] **Step 4: Return `bulkNetworks` in the success response**

The response already returns `assessor_adjustments` which includes all keys, so no change needed to the return JSON.

- [ ] **Step 5: Commit**

```bash
git add app/api/staff/applications/[id]/assessor-adjustments/route.ts
git commit -m "feat(bulk): extend assessor-adjustments API to accept bulkNetworks"
```

---

## Task 7: Assessment Report Form — Network Rows Section

**Files:**
- Modify: `components/inspection/assessment-report-form.tsx`

- [ ] **Step 1: Add props for bulk network editing**

Find `interface AssessmentReportFormProps` and add:
```typescript
  // Bulk application support
  isBulkApplication?: boolean;
  bulkNetworks?: import("@/types/database").BulkNetworkRow[];
  onBulkNetworksSave?: (networks: import("@/types/database").BulkNetworkRow[]) => Promise<void>;
  bulkNetworksSaving?: boolean;
```

Update function signature accordingly.

- [ ] **Step 2: Add local state for assessor-edited bulk networks**

Inside the component, after the existing state declarations, add:
```typescript
  const [localBulkNetworks, setLocalBulkNetworks] = useState(
    bulkNetworks ?? []
  );
  useEffect(() => {
    setLocalBulkNetworks(bulkNetworks ?? []);
  }, [bulkNetworks]);
```

- [ ] **Step 3: Add import for BulkNetworksTable**

```typescript
import { BulkNetworksTable } from "@/components/dashboard/bulk-networks-table";
```

- [ ] **Step 4: Add network rows section to the form JSX**

Find the return statement. Before the closing `</div>` of the main container, add a conditional section:

```tsx
{isBulkApplication && (
  <div className="space-y-4 border border-violet-200 dark:border-violet-700 rounded-lg p-4 bg-violet-50 dark:bg-violet-900/10">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="font-semibold text-violet-900 dark:text-violet-100">Network Rows</h3>
        <p className="text-sm text-violet-700 dark:text-violet-300">
          Edit output values (capacity, method, coordinates). Cannot add or remove rows.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        disabled={bulkNetworksSaving}
        onClick={async () => {
          if (onBulkNetworksSave) await onBulkNetworksSave(localBulkNetworks);
        }}
      >
        {bulkNetworksSaving ? "Saving…" : "Save Networks"}
      </Button>
    </div>
    <BulkNetworksTable
      rows={localBulkNetworks}
      onChange={setLocalBulkNetworks}
      mode="assessor"
    />
  </div>
)}
```

- [ ] **Step 5: Wire the assessment page to pass bulk props**

The assessment page that renders `AssessmentReportForm` is `app/assessment/page.tsx`. Find where `AssessmentReportForm` is rendered and add:

```tsx
isBulkApplication={!!(application as any)?.is_bulk}
bulkNetworks={
  (assessorAdjustments as any)?.bulkNetworks ??
  (application as any)?.bulk_networks ??
  []
}
onBulkNetworksSave={async (networks) => {
  await fetch(`/api/staff/applications/${applicationId}/assessor-adjustments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bulkNetworks: networks }),
  });
}}
```

- [ ] **Step 6: Commit**

```bash
git add components/inspection/assessment-report-form.tsx app/assessment/page.tsx
git commit -m "feat(bulk): assessment report network rows section (assessor edit)"
```

---

## Task 8: Terms Page — Bulk Permit Generation

**Files:**
- Modify: `app/dashboard/application/[id]/terms/page.tsx`

- [ ] **Step 1: Add helper to resolve final bulk networks**

Near the top of `handleAcceptTerms` function (after `applicationData` is loaded), add a helper:

```typescript
// Resolve final bulk networks: assessor-adjusted version takes priority
function resolveBulkNetworks(appData: any): import("@/types/database").BulkNetworkRow[] {
  const notes = typeof appData.internal_notes === "string"
    ? (() => { try { return JSON.parse(appData.internal_notes); } catch { return {}; } })()
    : (appData.internal_notes ?? {});
  const adjustments = notes._assessorAdjustments ?? {};
  if (Array.isArray(adjustments.bulkNetworks) && adjustments.bulkNetworks.length > 0) {
    return adjustments.bulkNetworks;
  }
  if (Array.isArray(appData.bulk_networks)) return appData.bulk_networks;
  return [];
}
```

- [ ] **Step 2: Add bulk permit generation block in `handleAcceptTerms`**

Find the `} else {` block that starts at line 1268 ("Creating NEW permit in database..."). Before that block (i.e., after all the transfer/renewal/modification branches end), add a new block for bulk:

```typescript
      } else if ((applicationData as any).is_bulk) {
        console.log('📝 Creating BULK permits (parent + children)...');
        const bulkRows = resolveBulkNetworks(applicationData);
        if (bulkRows.length === 0) {
          throw new Error('Bulk application has no network rows');
        }

        const newIssuedDate = issuanceBaseDateOnly;
        const newExpiryDate = computeExpiryDateOnly(resolvedDurationYearsGlobal);
        const totalVolume = bulkRows.reduce((sum, r) => sum + (r.capacity_m3_day ?? 0), 0);

        // Insert parent permit (no permit_number → DB trigger generates e.g. "000918/RWB/2026")
        const { data: parentPermit, error: parentError } = await supabase
          .from('permits')
          .insert({
            application_id: applicationId,
            status: 'active',
            water_source: applicationData.water_source,
            purpose: applicationData.water_purpose,
            water_allowance: totalVolume,
            allowance_unit: 'm³/day',
            issuing_authority: 'Rwanda Water Resources Board',
            issued_date: newIssuedDate,
            expiry_date: newExpiryDate,
            conditions: {
              conditions: [
                'Comply with all environmental regulations',
                'Submit quarterly usage reports',
                'Allow inspections as required',
                ...(applicationData.approval_conditions ? [applicationData.approval_conditions] : []),
              ],
              location: {
                district: (applicationData as any).bulk_district || applicationData.district,
              },
            },
          } as any)
          .select()
          .single() as { data: any; error: any };

        if (parentError || !parentPermit) {
          console.error('❌ Error creating parent bulk permit:', parentError);
          throw parentError ?? new Error('Parent permit insert returned no data');
        }

        const parentPermitNumber: string = parentPermit.permit_number;
        console.log('✅ Parent permit created:', parentPermitNumber);

        // Insert one child permit per network row
        const { buildChildPermitNumber } = await import('@/lib/permit-number-utils');
        for (const row of bulkRows) {
          const childNumber = buildChildPermitNumber(parentPermitNumber, row.number);
          const { error: childError } = await supabase
            .from('permits')
            .insert({
              application_id: applicationId,
              status: 'active',
              water_source: applicationData.water_source,
              purpose: applicationData.water_purpose,
              water_allowance: row.capacity_m3_day ?? 0,
              allowance_unit: 'm³/day',
              issuing_authority: 'Rwanda Water Resources Board',
              issued_date: newIssuedDate,
              expiry_date: newExpiryDate,
              permit_number: childNumber,
              parent_permit_id: parentPermit.id,
              network_sequence_index: row.number,
              conditions: {
                conditions: ['Comply with all environmental regulations'],
                location: {
                  sector: row.sector,
                  cell: row.cell,
                  village: row.village,
                  coordinates: row.coordinates,
                },
                network: {
                  name: row.network_name,
                  capacity_m3_day: row.capacity_m3_day,
                  abstraction_method: row.abstraction_method,
                },
              },
            } as any)
            .single();
          if (childError) {
            console.error('❌ Error creating child permit:', childNumber, childError);
            throw childError;
          }
          console.log('✅ Child permit created:', childNumber);

          // Sync each child to permit_registry
          syncRegistryViaApi(childNumber, {
            status: 'active',
            permit_holder: permitHolder,
            location: `${row.sector}, ${row.cell}, ${row.village ?? ''}, ${(applicationData as any).bulk_district || applicationData.district}`.trim().replace(/,\s*$/, ''),
            water_source: applicationData.water_source || undefined,
            authorized_activity: applicationData.water_purpose || undefined,
            volume_or_area: row.capacity_m3_day ? `${row.capacity_m3_day} m³/day` : undefined,
            issuance_date: newIssuedDate,
            expiration_date: newExpiryDate || undefined,
            duration: `${resolvedDurationYearsGlobal} years`,
            contact: registrySyncContact,
            method_of_water_taking: row.abstraction_method || undefined,
          }).catch(err => console.warn('⚠️ registry-sync (bulk child) failed:', err));
        }

        permitData = parentPermit;
```

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/application/\[id\]/terms/page.tsx
git commit -m "feat(bulk): terms page bulk permit generation (parent + child loop)"
```

---

## Task 9: PDF Permit Server — Bulk Template

**Files:**
- Modify: `lib/pdf-permit-server.ts`

- [ ] **Step 1: Add `renderBulkWaterSupply` function**

After the `renderConcessionOrganization` function (around line 730), add:

```typescript
async function renderBulkWaterSupply(opts: PermitRenderOpts): Promise<Buffer> {
  const { application: app, permitNumber } = opts;
  const issueDate = opts.issuedDate ?? new Date();
  const expiryDate =
    opts.expiryDate ??
    addYearsSafe(new Date(issueDate), resolvePermitDuration(app, opts.permitValidityYears));
  const ctx = buildSlotCtx(opts, issueDate, expiryDate);

  // Resolve bulk networks: assessor-adjusted first, then application
  const notes = getEffectiveInternalNotes((app as any).internal_notes);
  const bulkNetworks: import("@/types/database").BulkNetworkRow[] =
    (notes as any)?._assessorAdjustments?.bulkNetworks ??
    (app as any).bulk_networks ??
    [];
  const district: string = (app as any).bulk_district || (app as any).district || "";
  const representativeName: string =
    (app as any).applicant?.company_name ||
    `${(app as any).applicant?.first_name ?? ""} ${(app as any).applicant?.last_name ?? ""}`.trim();
  const repTitle: string = (app as any).representative_title || "";
  const networkCount = bulkNetworks.length;

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

  const doc = createDoc();
  await drawWatermark(doc);
  const logoBottomY = drawLogo(doc);

  const leftX = PERMIT_MARGIN_X;
  const maxW = pageWidth(doc) - leftX * 2;
  const fontSize = 11;
  const lineGap = 1.0;
  const paraGap = 5;

  // Title
  let y = logoBottomY + 8;
  doc.font(FONT_BOLD).fontSize(13).fillColor("#000000");
  const titleEn = `WATER USE PERMIT/ URUHUSHYA RWO GUKORESHA AMAZI N° ${permitNumber}`;
  doc.text(titleEn, leftX, y, { width: maxW, align: "center" });
  y += doc.heightOfString(titleEn, { width: maxW }) + paraGap;

  doc.font(FONT_REGULAR).fontSize(fontSize).fillColor("#000000");

  const enBody = `Pursuant to Law N°49/2018 of 13/08/2018 determining the use and management of water resources in Rwanda,\n\n"${representativeName}" with its registered list as follows${repTitle ? `, represented by ${repTitle},` : ","} is authorized to abstract water from ${networkCount} (${numberToWords(networkCount)}) water supply network${networkCount !== 1 ? "s" : ""} located in ${district} District as described in the attached annex. Water abstracted will be used for water supply.\n\nThis water use permit is valid for a period starting from ${formatDate(issueDate)} to ${formatDate(expiryDate)}.\n\nIn addition to the conditions specified in the Law mentioned above, this water use permit is subject to the terms and conditions as defined in the attached contract.`;

  const rwBody = `Hashingiwe ku Itegeko N°49/2018 ryo ku wa 13/08/2018 rigena imikoreshereze n'imicungire y'umutungo kamere w'amazi mu Rwanda,\n\n"${representativeName}" ${repTitle ? `ihagarariwe na ${repTitle},` : ""} yemerewe gukoresha amazi y'imiyoboro ${networkCount} (${numberToWordsRw(networkCount)}) iherereye mu Karere ka ${district} nkuko igaragara ku mugereka. Aya mazi yemerewe gukoreshwa mu bikorwa byo gukwirakwiza amazi.\n\nUru ruhushya rufite agaciro kuva ${formatDate(issueDate)} kugeza ${formatDate(expiryDate)}.\n\nUretse ibiteganywa n'Itegeko ryavuzwe haruguru, uru ruhushya kandi rugengwa n'ibikubiye mu masezerano ari ku mugereka.`;

  for (const para of [enBody]) {
    const h = doc.heightOfString(para, { width: maxW, lineGap });
    if (y + h > contentBottomY(doc)) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
    doc.text(para, leftX, y, { width: maxW, lineGap });
    y += h + paraGap;
  }

  // Divider + Kinyarwanda
  if (y > contentBottomY(doc) - 50) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
  y += 4;
  doc.moveTo(leftX, y).lineTo(leftX + maxW, y).lineWidth(0.6).stroke("#1f2937");
  y += 6;

  const rwH = doc.heightOfString(rwBody, { width: maxW, lineGap });
  if (y + rwH > contentBottomY(doc)) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
  doc.text(rwBody, leftX, y, { width: maxW, lineGap });
  y += rwH + paraGap;

  // Closing / signature line
  if (y > contentBottomY(doc) - 50) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
  y += 6;
  drawClosingLine(doc, y, ctx);

  if (opts.skipQr) {
    drawPreviewBanner(doc, ctx);
  } else {
    await drawQrFooter(doc, permitNumber, ctx);
  }

  // ---- Annex page ----
  doc.addPage();
  await drawWatermark(doc);
  drawPageBorder(doc);

  let ay = 30 * PT;
  doc.font(FONT_BOLD).fontSize(11).fillColor("#c05000");
  doc.text("PERMIT ISSUANCE", leftX, ay, { width: maxW });
  ay += 20;

  doc.font(FONT_REGULAR).fontSize(11).fillColor("#000000");
  doc.text(permitNumber, leftX, ay, { width: maxW });
  ay += 20;

  // Annex table
  const cols = [
    { label: "Permit Number", width: 110 },
    { label: "Network Name", width: 100 },
    { label: "Sector", width: 65 },
    { label: "Cell", width: 55 },
    { label: "Village", width: 60 },
    { label: "Coordinates", width: 85 },
    { label: "Capacity\n(m³/day)", width: 55 },
    { label: "Water abstraction\nmethod", width: 80 },
  ];
  const tableX = leftX;
  const rowH = 20;
  const headerH = 28;

  // Header row
  doc.font(FONT_BOLD).fontSize(9).fillColor("#000000");
  let cx = tableX;
  const tableWidth = cols.reduce((s, c) => s + c.width, 0);
  doc.rect(cx, ay, tableWidth, headerH).lineWidth(0.5).stroke("#000000");
  for (const col of cols) {
    doc.rect(cx, ay, col.width, headerH).lineWidth(0.5).stroke("#000000");
    doc.text(col.label, cx + 3, ay + 4, { width: col.width - 6, height: headerH - 4 });
    cx += col.width;
  }
  ay += headerH;

  const { buildChildPermitNumber } = require("@/lib/permit-number-utils");

  doc.font(FONT_REGULAR).fontSize(9).fillColor("#000000");
  for (const row of bulkNetworks) {
    const childNum = buildChildPermitNumber(permitNumber, row.number);
    const cells = [
      childNum,
      row.network_name,
      row.sector,
      row.cell,
      row.village ?? "",
      row.coordinates ?? "",
      row.capacity_m3_day != null ? String(row.capacity_m3_day) : "",
      row.abstraction_method ?? "",
    ];
    if (ay + rowH > contentBottomY(doc)) {
      doc.addPage(); await drawWatermark(doc); ay = 30 * PT;
    }
    cx = tableX;
    for (let ci = 0; ci < cols.length; ci++) {
      doc.rect(cx, ay, cols[ci].width, rowH).lineWidth(0.5).stroke("#000000");
      doc.text(cells[ci], cx + 3, ay + 5, { width: cols[ci].width - 6, height: rowH - 6, ellipsis: true });
      cx += cols[ci].width;
    }
    ay += rowH;
  }

  return docToBuffer(doc);
}

// Simple number-to-words helpers (English + Kinyarwanda) for small numbers
function numberToWords(n: number): string {
  const words = ["zero","one","two","three","four","five","six","seven","eight","nine","ten",
    "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen","twenty",
    "twenty-one","twenty-two","twenty-three","twenty-four","twenty-five","twenty-six","twenty-seven",
    "twenty-eight","twenty-nine","thirty","thirty-one","thirty-two","thirty-three","thirty-four","thirty-five",
    "thirty-six","thirty-seven","thirty-eight","thirty-nine","forty","forty-one","forty-two","forty-three",
    "forty-four","forty-five","forty-six","forty-seven","forty-eight","forty-nine","fifty"];
  return words[n] ?? String(n);
}

function numberToWordsRw(n: number): string {
  const words = ["zeru","rimwe","kabiri","gatatu","kane","gatanu","gatandatu","karindwi","umunani","icyenda","icumi",
    "cumi na rimwe","cumi na kabiri","cumi na gatatu","cumi na kane","cumi na gatanu","cumi na gatandatu",
    "cumi na karindwi","cumi na umunani","cumi na icyenda","makumyabiri",
    "makumyabiri n'imwe","makumyabiri n'ebyiri","makumyabiri n'eshatu","makumyabiri n'ine",
    "makumyabiri n'eshanu","makumyabiri n'isitandatu","makumyabiri n'indwi","makumyabiri n'inani",
    "makumyabiri n'icyenda","mirongo itatu","mirongo itatu n'imwe","mirongo itatu n'ebyiri",
    "mirongo itatu n'eshatu","mirongo itatu n'ine","mirongo itatu n'eshanu"];
  return words[n] ?? String(n);
}
```

- [ ] **Step 2: Wire `bulk_water_supply` variant into `generatePermitPdfBuffer`**

Find the `switch (variant)` in `generatePermitPdfBuffer` and add:
```typescript
    case "bulk_water_supply":
      return renderBulkWaterSupply(opts);
```

- [ ] **Step 3: Commit**

```bash
git add lib/pdf-permit-server.ts
git commit -m "feat(bulk): PDF bulk permit renderer with bilingual body + annex table"
```

---

## Task 10: Contract Terms — Bulk Template

**Files:**
- Modify: `lib/contract-terms.ts`
- Modify: `lib/contract-placeholders.ts`

- [ ] **Step 1: Add bulk contract template to `lib/contract-terms.ts`**

In `lib/contract-terms.ts`, find the function that returns contract terms by variant (search for `abstraction_organization`). Add a new export function for bulk:

```typescript
export function getBulkWaterSupplyContractTerms(opts: {
  companyName: string;
  representativeName: string;
  networkCount: number;
  district: string;
  permitNumber: string;
  startDate: string;
  endDate: string;
  bulkNetworks: import("@/types/database").BulkNetworkRow[];
  childPermitNumbers: string[];
}): ContractTerms {
  const {
    companyName, representativeName, networkCount, district,
    permitNumber, startDate, endDate, bulkNetworks, childPermitNumbers
  } = opts;

  // Build annex list as a formatted string for contract body reference
  const annexRef = "as per the attached annex";

  return {
    heading: `CONTRACT FOR WATER USE PERMIT N° ${permitNumber}`,
    sections: [
      {
        title: "PERMIT ISSUANCE",
        paragraphs: [
          `${companyName}${representativeName ? `, represented by ${representativeName},` : ","} is authorized to abstract water from ${networkCount} water supply network${networkCount !== 1 ? "s" : ""} located in ${district} District ${annexRef}. Water abstracted will be used for water supply.`,
          `This water use permit is valid from ${startDate} to ${endDate}.`,
          `In addition to the conditions of the applicable law, this permit is subject to the terms and conditions defined in this contract.`,
        ],
      },
      // Include same standard conditions sections as abstraction_organization variant
      // by importing the existing standard sections
    ],
  };
}
```

- [ ] **Step 2: Update `contract-placeholders.ts` to resolve bulk context**

In `lib/contract-placeholders.ts`, find `buildContractPlaceholderContext`. Add handling for bulk applications — when `application.is_bulk` is true, replace `{{locationDescription}}` and `{{waterUsageDescription}}` with the annex reference text:

```typescript
  // Bulk override: replace location/usage with annex reference
  if ((application as any).is_bulk) {
    const bulkDistrict = (application as any).bulk_district || application.district || "";
    const bulkNotes = typeof application.internal_notes === "string"
      ? (() => { try { return JSON.parse(application.internal_notes); } catch { return {}; } })()
      : (application.internal_notes ?? {});
    const bulkNetworks: import("@/types/database").BulkNetworkRow[] =
      (bulkNotes as any)?._assessorAdjustments?.bulkNetworks ??
      (application as any).bulk_networks ??
      [];
    return {
      ...baseCtx,
      locationDescription: `${bulkNetworks.length} water supply network${bulkNetworks.length !== 1 ? "s" : ""} in ${bulkDistrict} District as described in the attached annex`,
      waterUsageDescription: "water supply",
      isBulk: true,
      bulkNetworks,
    };
  }
```

- [ ] **Step 3: Update `ContractTermsPreview` component to render annex for bulk**

In `components/contract/contract-terms-preview.tsx`, after the last section is rendered, add:

```tsx
{/* Bulk annex table */}
{(placeholderCtx as any)?.isBulk && Array.isArray((placeholderCtx as any)?.bulkNetworks) && (
  <div className="mt-8 border-t pt-6">
    <div className="text-orange-600 font-semibold text-sm mb-2">PERMIT ISSUANCE</div>
    <div className="text-sm font-medium mb-3">{permitNumber}</div>
    <BulkNetworksTable
      rows={(placeholderCtx as any).bulkNetworks}
      mode="readonly"
    />
    <p className="text-xs text-gray-400 mt-2 italic">
      Permit numbers will be assigned upon issuance.
    </p>
  </div>
)}
```

Add the import at the top:
```typescript
import { BulkNetworksTable } from "@/components/dashboard/bulk-networks-table";
```

- [ ] **Step 4: Commit**

```bash
git add lib/contract-terms.ts lib/contract-placeholders.ts components/contract/contract-terms-preview.tsx
git commit -m "feat(bulk): bulk contract template + annex table in contract preview"
```

---

## Task 11: Public Permit View — Child Permit Lookup + Annex

**Files:**
- Modify: `lib/permit/public-permit-query.ts`
- Modify: `app/permit/view/[...permitNumber]/page.tsx`

- [ ] **Step 1: Update `findPublicPermitByNumber` to resolve child → parent**

In `lib/permit/public-permit-query.ts`, after the normal permit lookup, add child permit resolution. Find the `permitRes` query result handling. After getting the permit row, add:

```typescript
  // If this is a child permit (has parent_permit_id), fetch the parent instead
  // and load all sibling child permits for the annex
  let finalPermit = permitRes.rows[0] ?? null;
  let bulkChildren: unknown[] = [];

  if (finalPermit && (finalPermit as any).parent_permit_id) {
    const parentId = (finalPermit as any).parent_permit_id;
    const parentRes = await query(
      `SELECT p.*, a.* FROM public.permits p
       LEFT JOIN public.applications a ON a.id = p.application_id
       WHERE p.id = $1`,
      [parentId]
    );
    if (parentRes.rows[0]) {
      finalPermit = { ...parentRes.rows[0], source: "permits" as const };
    }
    // Load all children for annex
    const childrenRes = await query(
      `SELECT p.permit_number, p.network_sequence_index, p.conditions
       FROM public.permits p
       WHERE p.parent_permit_id = $1
       ORDER BY p.network_sequence_index ASC`,
      [parentId]
    );
    bulkChildren = childrenRes.rows;
  } else if (finalPermit && !(finalPermit as any).parent_permit_id) {
    // This might be a parent permit — load its children
    const childrenRes = await query(
      `SELECT p.permit_number, p.network_sequence_index, p.conditions
       FROM public.permits p
       WHERE p.parent_permit_id = $1
       ORDER BY p.network_sequence_index ASC`,
      [(finalPermit as any).id]
    );
    if (childrenRes.rows.length > 0) {
      bulkChildren = childrenRes.rows;
    }
  }
```

Update `PublicPermitRecord` type to include `bulk_children`:
```typescript
export type PublicPermitRecord = JsonRecord & {
  source: PublicPermitSource;
  permit_number: string;
  status: string;
  issued_date: string | null;
  expiry_date: string | null;
  application: JsonRecord | null;
  latitude: number | null;
  longitude: number | null;
  bulk_children?: unknown[];
};
```

Return `{ ...finalPermit, bulk_children: bulkChildren }` if bulk_children is populated.

- [ ] **Step 2: Render annex table in the public permit view page**

In `app/permit/view/[...permitNumber]/page.tsx`, find where permit details are rendered. After the main permit card, add:

```tsx
{/* Bulk permit annex */}
{Array.isArray((permit as any).bulk_children) && (permit as any).bulk_children.length > 0 && (
  <Card className="mt-6">
    <CardHeader>
      <CardTitle className="text-base text-orange-600">Annex — Water Supply Networks</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border px-3 py-2 text-left">Permit Number</th>
              <th className="border px-3 py-2 text-left">Network Name</th>
              <th className="border px-3 py-2 text-left">Sector</th>
              <th className="border px-3 py-2 text-left">Cell</th>
              <th className="border px-3 py-2 text-left">Village</th>
              <th className="border px-3 py-2 text-left">Coordinates</th>
              <th className="border px-3 py-2 text-left">Capacity (m³/day)</th>
              <th className="border px-3 py-2 text-left">Abstraction Method</th>
            </tr>
          </thead>
          <tbody>
            {((permit as any).bulk_children as any[]).map((child: any) => {
              const loc = child.conditions?.location ?? {};
              const net = child.conditions?.network ?? {};
              return (
                <tr key={child.permit_number} className="border-t">
                  <td className="border px-3 py-2 font-mono text-xs">{child.permit_number}</td>
                  <td className="border px-3 py-2">{net.name ?? ""}</td>
                  <td className="border px-3 py-2">{loc.sector ?? ""}</td>
                  <td className="border px-3 py-2">{loc.cell ?? ""}</td>
                  <td className="border px-3 py-2">{loc.village ?? ""}</td>
                  <td className="border px-3 py-2 font-mono text-xs">{loc.coordinates ?? ""}</td>
                  <td className="border px-3 py-2">{net.capacity_m3_day ?? ""}</td>
                  <td className="border px-3 py-2">{net.abstraction_method ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 3: Commit**

```bash
git add lib/permit/public-permit-query.ts app/permit/view/\[...permitNumber\]/page.tsx
git commit -m "feat(bulk): public permit view resolves child→parent + annex table"
```

---

## Task 12: Admin — is_bulk_applicant Toggle

**Files:**
- Modify: `components/admin/user-management.tsx`

- [ ] **Step 1: Add `is_bulk_applicant` to form schema**

Find the `z.object` schema for the user edit form (around line 71) and add:
```typescript
  is_bulk_applicant: z.boolean().optional(),
```

- [ ] **Step 2: Add the toggle to the edit form JSX**

Find the user edit form fields (around line 245 where `role` field is rendered). After the role selector, add:

```tsx
<div className="flex items-center gap-3">
  <input
    type="checkbox"
    id="is_bulk_applicant"
    checked={!!form.watch("is_bulk_applicant")}
    onChange={(e) => form.setValue("is_bulk_applicant", e.target.checked)}
    className="h-4 w-4"
  />
  <label htmlFor="is_bulk_applicant" className="text-sm font-medium">
    Bulk Applicant
    <span className="ml-2 text-xs text-gray-500">(enables bulk water permit application)</span>
  </label>
</div>
```

- [ ] **Step 3: Populate the field when opening the edit modal**

Find where form defaults are set from selected user (around line 275). Add:
```typescript
  is_bulk_applicant: selectedUser.is_bulk_applicant ?? false,
```

- [ ] **Step 4: Include in the updateUser call**

The `updateUser` at line 281 receives `data` from the form. The `is_bulk_applicant` field will be included automatically since it's in the schema.

- [ ] **Step 5: Commit**

```bash
git add components/admin/user-management.tsx
git commit -m "feat(bulk): admin is_bulk_applicant toggle in user management"
```

---

## Task 13: BULK Badge in Staff List Views + Registry PDF Resolution

**Files:**
- Modify: `components/approver/all-applications-list.tsx`
- Modify: `components/inspection/applications-data-table.tsx`
- Modify: `components/permit-registry/row-actions.tsx`

- [ ] **Step 1: Add BULK badge to approver list**

In `components/approver/all-applications-list.tsx`, find where the application number is rendered. After it, add:

```tsx
{(app as any).is_bulk && (
  <Badge variant="outline" className="text-xs border-violet-400 text-violet-700 bg-violet-50">
    BULK
  </Badge>
)}
```

- [ ] **Step 2: Add BULK badge to inspection applications table**

Apply the same pattern in `components/inspection/applications-data-table.tsx`.

- [ ] **Step 3: Update permit registry row actions to resolve parent PDF for child permits**

In `components/permit-registry/row-actions.tsx`, find the "View PDF" action handler. Add logic: if the permit number matches the child format (`/\d+_\d+\/RWB\/\d{4}/`), resolve to the parent permit PDF by stripping the `_N` suffix:

```typescript
function resolvePermitPdfNumber(permitNumber: string): string {
  // Child permit: "000918_1/RWB/2026" → parent "000918/RWB/2026"
  const childMatch = permitNumber.match(/^(\d+)_\d+(\/RWB\/\d{4})$/i);
  if (childMatch) return `${childMatch[1]}${childMatch[2]}`;
  return permitNumber;
}
```

Use this when building the PDF URL for child permits.

- [ ] **Step 4: Commit**

```bash
git add components/approver/all-applications-list.tsx components/inspection/applications-data-table.tsx components/permit-registry/row-actions.tsx
git commit -m "feat(bulk): BULK badge in staff views + registry child→parent PDF resolution"
```

---

## Task 14: Run DB Migration on UAT

- [ ] **Step 1: Apply migration to UAT database**

The migration file is at `database/migrations/2026-05-07-bulk-application.sql`. Run it on the UAT PostgreSQL server via SSH:

```bash
# Via the RWB server
ssh qtgentil@10.10.82.199
psql -U <db_user> -d <db_name> -f /path/to/migration
```

Or run SQL directly in the Supabase/PostgreSQL console on the UAT environment.

- [ ] **Step 2: Push UAT branch**

```bash
git push origin chore/stage-unstaged-2026-03-01-uat
```

---

## Self-Review Checklist

- [x] DB migration covers all 3 tables (users, applications, permits)
- [x] `is_bulk` set automatically from `is_bulk_applicant` flag via `mapFormDataToApplication`
- [x] `bulk_water_supply` variant checked first in `selectPermitVariant`
- [x] Child permit format `000918_1/RWB/2026` parseable by `permit-number-utils`
- [x] `BulkNetworksTable` has 3 distinct modes (editable / assessor / readonly)
- [x] Land ownership section hidden for bulk users
- [x] Assessor can edit network row values (not add/delete) via existing adjustments API
- [x] Terms page creates parent + N child permits atomically, syncs each child to registry
- [x] Only parent PDF generated; child registry entries resolve to parent PDF
- [x] Public permit view handles child permit URL → shows parent + annex
- [x] Contract preview shows annex table; Permit Number column blank until issuance
- [x] Admin toggle sets `is_bulk_applicant` on user record
- [x] BULK badge visible in staff list views
- [x] All changes on UAT branch only, not pushed to prod
