"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { AbstractionPointMapProps } from "@/components/maps/AbstractionPointMap";
import type { MultiPolygonMapProps } from "@/components/maps/MultiPolygonMap";
import type { CoordinatePoint } from "@/lib/geoUtils";
import type { AppLanguage } from "@/lib/i18n/language";
import { getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";

const mapLoader = () => (
  <div className="flex h-[350px] w-full items-center justify-center rounded-lg border bg-slate-50">
    <span className="text-sm text-slate-400">Loading map…</span>
  </div>
);

const AbstractionPointMap = dynamic<AbstractionPointMapProps>(
  () => import("@/components/maps/AbstractionPointMap").then((m) => m.AbstractionPointMap),
  { ssr: false, loading: mapLoader }
);

const MultiPolygonMap = dynamic<MultiPolygonMapProps>(
  () => import("@/components/maps/MultiPolygonMap").then((m) => m.MultiPolygonMap),
  { ssr: false, loading: mapLoader }
);

interface PermitLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  polygons?: CoordinatePoint[][];
  /**
   * Link to the printable concession boundary map. Only rendered when the
   * permit actually has boundary polygons to print.
   */
  printHref?: string | null;
}

// Colours must stay in sync with POLYGON_COLORS in MultiPolygonMap.tsx
const ZONE_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
];

function toNum(v: string | number): number {
  return typeof v === "string" ? parseFloat(v) : v;
}

export function PermitLocationMap({ latitude, longitude, polygons, printHref }: PermitLocationMapProps) {
  const [language, setLanguage] = useState<AppLanguage>("en");
  const tx = useCallback((value: string) => translateText(value, language), [language]);

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const hasCoordinates =
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    typeof longitude === "number" &&
    Number.isFinite(longitude);

  const hasPolygons = Array.isArray(polygons) && polygons.length > 0 && polygons[0].length >= 3;

  if (!hasCoordinates && !hasPolygons) {
    return null;
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {tx("Permit Map Location")}
        </h3>
        {hasPolygons && printHref ? (
          <Link
            href={printHref}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9V2h12v7" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            {tx("Printable map")}
          </Link>
        ) : null}
      </div>

      {hasPolygons ? (
        <>
          <MultiPolygonMap
            polygons={polygons}
            activePolygonIndex={0}
            height="350px"
            fitAllPolygons
            showMarkersForAll
          />

          {/* Coordinate tables — one per polygon zone */}
          <div className="space-y-4 pt-1">
            {polygons.map((zone, zoneIdx) => {
              const color = ZONE_COLORS[zoneIdx % ZONE_COLORS.length];
              const label =
                polygons.length === 1
                  ? tx("Concession boundary coordinates")
                  : `${tx("Zone")} ${zoneIdx + 1} — ${tx("boundary coordinates")}`;

              return (
                <div key={zoneIdx} className="overflow-hidden rounded-lg border">
                  <div
                    className="flex items-center gap-2 px-3 py-2"
                    style={{ backgroundColor: `${color}18`, borderBottom: `1px solid ${color}40` }}
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs font-semibold text-slate-700">{label}</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-slate-50 text-left text-slate-500">
                        <th className="px-3 py-2 font-medium">{tx("Point")}</th>
                        <th className="px-3 py-2 font-medium">{tx("Latitude")}</th>
                        <th className="px-3 py-2 font-medium">{tx("Longitude")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zone.map((pt, ptIdx) => {
                        const lat = toNum(pt.latitude);
                        const lng = toNum(pt.longitude);
                        return (
                          <tr
                            key={ptIdx}
                            className="border-b last:border-0 odd:bg-white even:bg-slate-50"
                          >
                            <td className="px-3 py-2 font-mono text-slate-500">
                              <span
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                                style={{ backgroundColor: color }}
                              >
                                {ptIdx + 1}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-800">
                              {Number.isFinite(lat) ? lat.toFixed(6) : "—"}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-800">
                              {Number.isFinite(lng) ? lng.toFixed(6) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {hasCoordinates && (
            <div className="text-sm text-slate-700">
              {tx("Coordinates:")} {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </div>
          )}
          <AbstractionPointMap
            latitude={latitude}
            longitude={longitude}
            readOnly
            height="350px"
          />
        </>
      )}
    </div>
  );
}
