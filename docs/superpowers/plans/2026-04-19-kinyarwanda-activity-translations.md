# Kinyarwanda Activity Translations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add proper professional Kinyarwanda translations for all 14 water-use activity names in both the application form UI and the Kinyarwanda contract PDF.

**Architecture:** Two files change. `messages/rw.json` gains 14 entries in `applicationForm.literal` so `tx()` returns Kinyarwanda activity names in the UI. `lib/contract-placeholders.ts` gains a `activityLabelRw` field in the context type + a parallel lookup map, so the Kinyarwanda contract PDF placeholder `IBIKORWA/ IMIRIMO BYASABIWE URUHUSHYA` is filled with the Kinyarwanda label rather than English.

**Tech Stack:** Next.js / TypeScript, custom i18n via `tx()` in `lib/i18n/translator.ts`

---

### Task 1: Add activity name translations to rw.json

**Files:**
- Modify: `messages/rw.json` (add 14 entries under `applicationForm.literal`)

- [ ] **Step 1: Open rw.json and locate the literal section**

File: `messages/rw.json`  
Find the key `"applicationForm"` → `"literal"`. It currently has entries like `"Intended Activity": "Igikorwa giteganyijwe"` but no individual activity names.

- [ ] **Step 2: Add the 14 activity translations inside `applicationForm.literal`**

Add these key/value pairs alongside the existing entries:

```json
"Coffee washing": "Isukura ry'ikawa",
"Construction of a dam": "Kubaka Urugomero",
"Construction or installation of infrastructure": "Kubaka cyangwa gushyiraho ibikorwa remezo",
"Electricity generation (Hydropower)": "Gukora amashanyarazi (Amashanyarazi y'amazi)",
"Fish farming in lakes": "Uburobyi byo mu biyaga",
"Fish farming in ponds": "Uburobyi bwo mu kidendezi",
"Gaz extraction": "Kwakira gaze",
"Industry": "Inganda",
"Irrigation": "Kuhira",
"Livestock": "Ubworozi",
"Mining": "Amabuye y'agaciro",
"Recreational activities": "Ibikorwa byo kuryoherereza",
"Water supply": "Gutanga amazi",
"Other (specify)": "Ikindi (sobanura)"
```

The keys must exactly match the English strings passed to `tx()` in `application-form-new.tsx` (lines ~4198-4214).

- [ ] **Step 3: Commit**

```bash
git add messages/rw.json
git commit -m "feat: add Kinyarwanda translations for all 14 water-use activity names"
```

---

### Task 2: Add activityLabelRw to ContractPlaceholderContext

**Files:**
- Modify: `lib/contract-placeholders.ts`

- [ ] **Step 1: Add `activityLabelRw` to the context type**

In `lib/contract-placeholders.ts`, find `ContractPlaceholderContext` (line ~5). After the existing `activityLabel` line (~line 28):

```typescript
activityLabel: string; // e.g. "Fish farming in lakes"
```

Add:

```typescript
activityLabelRw: string; // e.g. "Uburobyi byo mu biyaga"
```

- [ ] **Step 2: Add Kinyarwanda lookup map in resolveActivityLabel area**

After `resolveActivityLabel` (line ~237-267), add a new function immediately below:

```typescript
function resolveActivityLabelRw(application: ApplicationForContract): string {
  const notes = getInternalNotes(application);
  let intended = Array.isArray((application as any).intended_activities)
    ? ((application as any).intended_activities as unknown[]).map(String).filter(Boolean)
    : Array.isArray(notes?.intendedActivities)
      ? (notes?.intendedActivities as unknown[]).map(String).filter(Boolean)
      : [];
  if (!intended.length && typeof notes?.transferFormData?.waterPurpose === "string") {
    const tp = notes.transferFormData.waterPurpose.trim();
    if (tp) intended = [tp];
  }
  const primary = intended?.[0] ?? "";
  const labels: Record<string, string> = {
    fish_farming_lakes: "Uburobyi byo mu biyaga",
    fish_farming_ponds: "Uburobyi bwo mu kidendezi",
    irrigation: "Kuhira",
    water_supply: "Gutanga amazi",
    industry: "Inganda",
    coffee_washing: "Isukura ry'ikawa",
    electricity_generation: "Gukora amashanyarazi (Amashanyarazi y'amazi)",
    mining: "Amabuye y'agaciro",
    construction_of_dam: "Kubaka Urugomero",
    construction_of_infrastructures: "Kubaka cyangwa gushyiraho ibikorwa remezo",
    navigation: "Ubwogero",
    recreation_activities: "Ibikorwa byo kuryoherereza",
    gaz_extraction: "Kwakira gaze",
    livestock: "Ubworozi",
    other: "Ikindi",
  };
  return labels[primary] || (primary ? primary.replaceAll("_", " ") : "N/A");
}
```

- [ ] **Step 3: Populate activityLabelRw in buildContractPlaceholderContext**

Find `baseCtx` (~line 632). After:

```typescript
activityLabel: resolveActivityLabel(application),
```

Add:

```typescript
activityLabelRw: resolveActivityLabelRw(application),
```

- [ ] **Step 4: Use activityLabelRw in the Kinyarwanda placeholder substitution**

Find (~line 814):

```typescript
s = s.replaceAll("IBIKORWA/ IMIRIMO BYASABIWE URUHUSHYA", ctx.activityLabel);
```

Change to:

```typescript
s = s.replaceAll("IBIKORWA/ IMIRIMO BYASABIWE URUHUSHYA", ctx.activityLabelRw);
```

- [ ] **Step 5: Commit**

```bash
git add lib/contract-placeholders.ts
git commit -m "feat: use Kinyarwanda activity label in Kinyarwanda contract PDF"
```

---

### Task 3: Build verification and push

- [ ] **Step 1: Run TypeScript build to verify no type errors**

```bash
npm run build
```

Expected: Build completes with no TypeScript errors. (Warnings about unrelated items are acceptable.)

- [ ] **Step 2: Push to staging branch**

```bash
git push origin chore/stage-unstaged-2026-03-01
```

- [ ] **Step 3: Push to UAT/main branch**

Check which branches exist and push to both the staging and UAT branches as instructed.

```bash
git branch -r | grep -E "staging|uat|main|master"
git push origin HEAD:<branch-name>
```
