# Assessor Coordinate Adjustments — Design

**Date:** 2026-04-27
**Status:** Approved for implementation planning
**Author:** Cursor with nourumuneza

## Problem

The assessment report currently shows water source coordinates as read-only values prefilled from the submitted application. Assessors can already revise permit duration and water output volume, and those revised values are used by permit and terms documents without changing the applicant's original submission.

Assessors also need to revise the water source coordinates when the field assessment finds that the submitted latitude, longitude, or concession polygon is wrong. The revised coordinates must be used by contracts, terms, and permits, but the original application data must remain unchanged.

This must work across the permit lifecycle: new applications, approved modifications, renewals, and transfers should not revert to outdated applicant-submitted coordinates after an assessor has approved revised values.

## Goal

Let assessors edit water source coordinates directly where they already appear in Section 2 of the assessment report:

- abstraction applications: single latitude and longitude fields
- concession applications: polygon coordinate points

Persist those revised values separately from the submitted application data and make all generated documents prefer the assessor-approved coordinates.

## Storage

No schema migration is needed. Revised coordinates live inside the existing `applications.internal_notes` JSON blob under `_assessorAdjustments`, matching the existing assessor duration and volume pattern:

```jsonc
{
  "_assessorAdjustments": {
    "permitLengthYears": 10,
    "recommendedVolumeM3": 32511,
    "waterSourceLatitude": -1.934332158,
    "waterSourceLongitude": 29.60182031,
    "waterSourcePolygonPoints": [
      { "latitude": "-1.934332158", "longitude": "29.60182031" },
      { "latitude": "-1.934500000", "longitude": "29.60210000" }
    ],
    "coordinatesAdjustedAt": "2026-04-27T08:45:00Z"
  }
}
```

The applicant's submitted `waterSourceLatitude`, `waterSourceLongitude`, `waterSourcePolygons`, and `coordinates` values remain unchanged. `_assessorAdjustments` becomes the effective document source when present.

## UI

Section 2 `Water Source` remains the place where coordinates are edited.

For abstraction reports, the existing `Latitude` and `Longitude` fields become editable when the assessment is editable. Reviewers, approvers, and read-only assessment states continue to see the values as read-only.

For concession reports, each displayed polygon point becomes editable in place. The assessor edits the point coordinates directly in the polygon list instead of using the `Assessor Recommendations` comparison table.

The existing `Assessor Recommendations` table remains focused on duration and output volume or concession area. LAT/LONG and polygon coordinates do not become rows in that table.

## Save Path

Coordinate saves use the existing race-safe assessor adjustment endpoint:

`POST /api/staff/applications/[id]/assessor-adjustments`

The endpoint will be extended to accept:

- `waterSourceLatitude` and `waterSourceLongitude` as a pair
- `waterSourcePolygonPoints` as an array of latitude/longitude point objects

The endpoint keeps its existing transaction and `SELECT ... FOR UPDATE` row lock. It mutates only `_assessorAdjustments` and first-save original-requested metadata, preserving sibling JSON paths such as `document_overrides`. This avoids reintroducing the internal-notes clobbering race that the endpoint was created to prevent.

Validation rules:

- latitude must be a finite number between `-90` and `90`
- longitude must be a finite number between `-180` and `180`
- abstraction saves require both latitude and longitude together
- concession polygon saves require at least one valid point, and each point must have both latitude and longitude
- renewal applications remain locked in the assessment editor unless the existing renewal policy is changed separately

## Document Resolution

Contracts, terms, and permits must use a consistent effective-coordinate priority:

1. `_assessorAdjustments.waterSourceLatitude` and `_assessorAdjustments.waterSourceLongitude`
2. `_assessorAdjustments.waterSourcePolygonPoints` for concession polygon output
3. submitted `internal_notes.waterSourceLatitude`, `internal_notes.waterSourceLongitude`, and `internal_notes.waterSourcePolygons`
4. nested renewal or transfer data where applicable
5. `applications.coordinates` geometry fallback
6. `N/A`

The implementation should update the existing resolver locations rather than create disconnected document-specific logic:

- `lib/pdf-generator.ts`
- `lib/contract-placeholders.ts`
- `lib/permit/permit-text-data.ts`
- `lib/document-slots/permit-slots.ts` where it relies on the shared permit text data
- `app/dashboard/application/[id]/terms/page.tsx` for any terms page coordinate tokens or coordinate-bearing context

The objective is that the same effective assessor coordinates appear in permit previews, generated permit PDFs, contract previews, terms and conditions, and any downstream document text that displays source coordinates.

## Lifecycle Continuity

### New Applications

The assessor saves revised coordinates into the current application's `_assessorAdjustments`. Documents for that application immediately prefer the revised values.

### Modifications

The approved-modification propagation endpoint already carries assessor duration and volume from `_assessorAdjustments` into the underlying application context. It will be extended to propagate revised latitude, longitude, and concession polygon points the same way.

This ensures an approved modification becomes the active source for future permit, renewal, transfer, and registry-related document flows.

### Renewals

Renewal document generation should seed from the latest effective coordinate values from the renewed permit/application context. If the prior active application has assessor-adjusted coordinates, the renewal flow must keep those values instead of falling back to the original submitted coordinates.

The assessment editor remains read-only for renewal assessor recommendations in this design.

### Transfers

Transfer flows should also seed from the latest effective coordinates. Manual or legacy transfers that only have `transferFormData` still fall back to that data when no assessor adjustment exists.

If a transferred permit originates from an application with assessor-adjusted coordinates, the transfer contract and permit text should keep the adjusted coordinates.

## Error Handling

If coordinate validation fails, the UI shows a clear save error and does not refresh the document preview.

If the endpoint encounters malformed `internal_notes`, it should keep the current behavior: refuse to overwrite the row and ask for administrator repair instead of silently destroying existing notes.

If the row is locked by another write, the endpoint returns the existing retry response and the UI asks the assessor to retry.

## Testing

Implementation should verify:

- abstraction latitude/longitude edits save to `_assessorAdjustments` and do not alter submitted application coordinate fields
- concession polygon edits save to `_assessorAdjustments.waterSourcePolygonPoints`
- permit preview and generated permit PDF use revised abstraction coordinates
- contract preview uses revised abstraction coordinates
- terms and conditions use revised coordinates wherever coordinates are displayed
- concession permit/contract coordinate sections use revised polygon points
- approved modifications propagate revised coordinates into the active application context
- renewal and transfer document flows keep the latest effective coordinates
- concurrent saves to document overrides and assessor adjustments do not clobber sibling JSON paths

## Non-goals

- No database schema migration.
- No change to applicant-submitted application data.
- No change to the duration and volume recommendation behavior except keeping it compatible with the extended endpoint.
- No new coordinate map editor.
- No policy change allowing renewal recommendations to be edited directly.
