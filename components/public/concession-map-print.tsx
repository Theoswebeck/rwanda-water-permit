"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import type { MultiPolygonMapProps } from "@/components/maps/MultiPolygonMap";
import type { CoordinatePoint } from "@/lib/geoUtils";
import { coordinatesToGeoJSON, getPolygonArea } from "@/lib/geoUtils";
import type { AppLanguage } from "@/lib/i18n/language";
import { getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";

const mapLoader = () => (
  <div className="flex h-[430px] w-full items-center justify-center rounded-lg border bg-slate-50">
    <span className="text-sm text-slate-400">Loading map…</span>
  </div>
);

const MultiPolygonMap = dynamic<MultiPolygonMapProps>(
  () => import("@/components/maps/MultiPolygonMap").then((m) => m.MultiPolygonMap),
  { ssr: false, loading: mapLoader }
);

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

export interface ConcessionMapPrintProps {
  permitNumber: string;
  holderName: string;
  activity: string;
  /** Recorded concession area (e.g. "12.5 ha") or "N/A". */
  recordedArea: string;
  location: string;
  issueDate: string;
  expiryDate: string;
  statusLabel: string;
  polygons: CoordinatePoint[][];
  /** Link back to the permit verification page. */
  backHref: string;
}

function toNum(v: string | number): number {
  return typeof v === "string" ? parseFloat(v) : v;
}

function hectares(areaSquareMeters: number): string {
  return `${(areaSquareMeters / 10_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ha`;
}

export function ConcessionMapPrint({
  permitNumber,
  holderName,
  activity,
  recordedArea,
  location,
  issueDate,
  expiryDate,
  statusLabel,
  polygons,
  backHref,
}: ConcessionMapPrintProps) {
  const [language, setLanguage] = useState<AppLanguage>("en");
  const tx = useCallback((value: string) => translateText(value, language), [language]);
  const [generatedOn, setGeneratedOn] = useState("");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  // Set client-side so the SSR and hydrated markup never disagree.
  useEffect(() => {
    setGeneratedOn(
      new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    );
  }, []);

  const zoneAreas = polygons.map((zone) => {
    const feature = coordinatesToGeoJSON(zone);
    return feature ? getPolygonArea(feature) : 0;
  });
  const totalArea = zoneAreas.reduce((sum, a) => sum + a, 0);

  return (
    <div className="concession-map-print min-h-screen bg-slate-50 print:bg-white">
      {/* Print-specific rules that Tailwind variants can't express. */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          .concession-map-print { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .concession-map-print .leaflet-control-zoom,
          .concession-map-print .leaflet-control-attribution { display: none !important; }
          .concession-map-print tr { break-inside: avoid; }
        }
      `}</style>

      <div className="container mx-auto px-4 py-6 print:max-w-none print:p-0">
        <div className="mx-auto max-w-4xl">
          {/* Toolbar — hidden when printing */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
              {tx("Back to permit")}
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9V2h12v7" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              {tx("Print / Save as PDF")}
            </button>
          </div>
          <p className="mb-4 text-xs text-slate-500 print:hidden">
            {tx("Wait until the map tiles are fully visible before printing.")}
          </p>

          <div className="rounded-xl border bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
            {/* RWB header */}
            <div className="flex items-center gap-4 border-b px-6 py-5">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 bg-white shadow-sm print:shadow-none">
                <Image
                  src="/assets/rwanda_water_board_Logo.png"
                  alt="Rwanda Water Resources Board"
                  fill
                  sizes="56px"
                  className="object-contain p-1.5"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold leading-tight text-slate-900">
                  {tx("Rwanda Water Resources Board")}
                </div>
                <div className="mt-0.5 text-sm font-medium text-slate-600">
                  {tx("Authorized Concession Boundary Map")}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium text-slate-500">{tx("Permit number")}</div>
                <div className="mt-1 rounded-md border bg-slate-50 px-3 py-1.5 font-mono text-sm">
                  {permitNumber}
                </div>
              </div>
            </div>

            {/* Permit summary */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-6 py-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-slate-500">{tx("Permit holder")}</div>
                <div className="mt-0.5 text-sm font-medium text-slate-900">{holderName}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tx("Intended water activity")}</div>
                <div className="mt-0.5 text-sm font-medium text-slate-900">{activity}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tx("Surface concession area")}</div>
                <div className="mt-0.5 text-sm font-medium text-slate-900">{recordedArea}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tx("Issue date")}</div>
                <div className="mt-0.5 text-sm font-medium text-slate-900">{issueDate}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tx("Expiry date")}</div>
                <div className="mt-0.5 text-sm font-medium text-slate-900">{expiryDate}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tx("Status")}</div>
                <div className="mt-0.5 text-sm font-medium text-slate-900">{tx(statusLabel)}</div>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <div className="text-xs text-slate-500">{tx("Location")}</div>
                <div className="mt-0.5 text-sm font-medium text-slate-900">{location}</div>
              </div>
            </div>

            {/* Map with north arrow overlay */}
            <div className="px-6 pb-2">
              <div className="relative overflow-hidden rounded-lg border">
                <MultiPolygonMap
                  polygons={polygons}
                  activePolygonIndex={0}
                  height="430px"
                  fitAllPolygons
                  showMarkersForAll
                  showScale
                />
                {/* North arrow */}
                <div
                  className="pointer-events-none absolute right-3 top-3 flex h-12 w-9 flex-col items-center justify-center rounded-md border border-slate-300 bg-white/90 shadow-sm"
                  style={{ zIndex: 1000 }}
                  aria-hidden="true"
                >
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 3 L16 17 L12 13.5 L8 17 Z" fill="#0f172a" />
                  </svg>
                  <span className="text-[11px] font-bold leading-none text-slate-900">N</span>
                </div>
              </div>
            </div>

            {/* Boundary coordinate tables */}
            <div className="space-y-4 px-6 pb-4 pt-2">
              {polygons.map((zone, zoneIdx) => {
                const color = ZONE_COLORS[zoneIdx % ZONE_COLORS.length];
                const label =
                  polygons.length === 1
                    ? tx("Concession boundary coordinates")
                    : `${tx("Zone")} ${zoneIdx + 1} — ${tx("boundary coordinates")}`;

                return (
                  <div key={zoneIdx} className="overflow-hidden rounded-lg border">
                    <div
                      className="flex items-center justify-between gap-2 px-3 py-2"
                      style={{ backgroundColor: `${color}18`, borderBottom: `1px solid ${color}40` }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs font-semibold text-slate-700">{label}</span>
                      </div>
                      {zoneAreas[zoneIdx] > 0 ? (
                        <span className="text-xs font-medium text-slate-600">
                          {tx("Area")}: {hectares(zoneAreas[zoneIdx])}
                        </span>
                      ) : null}
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

              {totalArea > 0 ? (
                <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2">
                  <span className="text-xs font-semibold text-slate-700">
                    {tx("Total area (computed from boundary)")}
                  </span>
                  <span className="text-xs font-bold text-slate-900">{hectares(totalArea)}</span>
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="border-t px-6 py-4 text-xs text-slate-500">
              <p>
                {tx("This map was generated from the Rwanda Water Resources Board water permit system and shows the authorized concession boundary for the permit above.")}
              </p>
              {generatedOn ? (
                <p className="mt-1">
                  {tx("Generated on")} {generatedOn}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
