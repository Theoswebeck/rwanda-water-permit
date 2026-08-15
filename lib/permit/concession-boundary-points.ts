// Pure helpers for the assessor's concession boundary points.
//
// Kept out of the editor component so both the UI
// (components/inspection/concession-boundary-editor.tsx) and the save handler
// (app/assessment/application/[id]/page.tsx) apply exactly the same rules, and
// so they can be unit-tested without a DOM.

import type { CoordinatePoint } from "@/lib/geoUtils";

export interface BoundaryPoint {
  latitude: string;
  longitude: string;
}

/** The minimum number of points that can enclose an area. */
export const MIN_BOUNDARY_POINTS = 3;

/**
 * A point counts as filled once the assessor has typed anything into either
 * box. Blank rows are scaffolding the form renders, not data — they are dropped
 * before validating so an untouched row can never block the whole submission.
 */
export function isBlankPoint(point: BoundaryPoint | undefined | null): boolean {
  if (!point) return true;
  return !String(point.latitude ?? "").trim() && !String(point.longitude ?? "").trim();
}

/**
 * Drops blank rows (anywhere in the list, not just the tail). A half-filled row
 * is deliberately kept: it is a mistake the assessor should see flagged, not
 * something to silently discard.
 */
export function compactBoundaryPoints(points: BoundaryPoint[] | undefined | null): BoundaryPoint[] {
  return (points ?? []).filter((point) => !isBlankPoint(point));
}

/** The subset of filled points that parse as a real coordinate pair. */
export function parseBoundaryPoints(points: BoundaryPoint[] | undefined | null): CoordinatePoint[] {
  const parsed: CoordinatePoint[] = [];
  for (const point of compactBoundaryPoints(points)) {
    const lat = Number.parseFloat(String(point.latitude ?? "").trim());
    const lng = Number.parseFloat(String(point.longitude ?? "").trim());
    if (Number.isFinite(lat) && Number.isFinite(lng)) parsed.push({ latitude: lat, longitude: lng });
  }
  return parsed;
}

/** How many filled rows failed to parse — surfaced to the assessor as a warning. */
export function countUnparseablePoints(points: BoundaryPoint[] | undefined | null): number {
  return compactBoundaryPoints(points).length - parseBoundaryPoints(points).length;
}
