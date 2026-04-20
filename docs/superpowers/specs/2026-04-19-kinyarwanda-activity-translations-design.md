# Kinyarwanda Activity Translations — Design Spec

**Date:** 2026-04-19  
**Status:** Approved

## Problem

The 14 "Intended Activity" options are not translated into Kinyarwanda in two places:

1. **UI form** — `messages/rw.json` has no entries for the individual activity names. When a user switches to Kinyarwanda, `tx()` falls back to English.
2. **Kinyarwanda contract PDF** — `resolveActivityLabel()` in `contract-placeholders.ts` only returns English. The Kinyarwanda contract section replaces `"IBIKORWA/ IMIRIMO BYASABIWE URUHUSHYA"` with the English label, meaning the official Kinyarwanda permit document contains English activity names.

## Translation Table

| English | Kinyarwanda |
|---------|-------------|
| Coffee washing | Isukura ry'ikawa |
| Construction of a dam | Kubaka Urugomero |
| Construction or installation of infrastructure | Kubaka cyangwa gushyiraho ibikorwa remezo |
| Electricity generation (Hydropower) | Gukora amashanyarazi (Amashanyarazi y'amazi) |
| Fish farming in lakes | Uburobyi byo mu biyaga |
| Fish farming in ponds | Uburobyi bwo mu kidendezi |
| Gaz extraction | Kwakira gaze |
| Industry | Inganda |
| Irrigation | Kuhira |
| Livestock | Ubworozi |
| Mining | Amabuye y'agaciro |
| Recreational activities | Ibikorwa byo kuryoherereza |
| Water supply | Gutanga amazi |
| Other (specify) | Ikindi (sobanura) |

## Changes Required

### 1. `messages/rw.json` — UI Form

Add all 14 activity name translations to the `applicationForm.literal` section. The keys must exactly match the English strings passed to `tx()` in `application-form-new.tsx`.

### 2. `lib/contract-placeholders.ts` — Contract PDF

**Step A:** Add `activityLabelRw: string` field to `ContractPlaceholderContext` type.

**Step B:** Add a Kinyarwanda lookup map alongside the existing English map in `resolveActivityLabel` (or a new `resolveActivityLabelRw` function):

```typescript
const rwMap: Record<string, string> = {
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
  fish_farming_lakes: "Uburobyi byo mu biyaga",
  fish_farming_ponds: "Uburobyi bwo mu kidendezi",
  other: "Ikindi",
};
```

**Step C:** Populate `activityLabelRw` in `buildContractPlaceholderContext`.

**Step D:** In `applyKinyarwandaPlaceholders`, update the line:
```typescript
s = s.replaceAll("IBIKORWA/ IMIRIMO BYASABIWE URUHUSHYA", ctx.activityLabel);
```
to:
```typescript
s = s.replaceAll("IBIKORWA/ IMIRIMO BYASABIWE URUHUSHYA", ctx.activityLabelRw);
```

Also update any other Kinyarwanda-section placeholder replacements that use `ctx.activityLabel` to use `ctx.activityLabelRw`.

## Scope

- No database changes required — activity values (e.g. `coffee_washing`) are stored as-is; only display labels change.
- No changes to `application-form-new.tsx` — it already uses `tx()` for all activity labels.
- No changes to `contract-terms.ts` — template text is unchanged.
- English contract PDF is unaffected.
