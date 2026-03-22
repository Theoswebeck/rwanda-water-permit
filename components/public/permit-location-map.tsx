"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
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
}

export function PermitLocationMap({ latitude, longitude, polygons }: PermitLocationMapProps) {
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
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {tx("Permit Map Location")}
      </h3>
      {hasCoordinates && (
        <div className="text-sm text-slate-700">
          {tx("Coordinates:")} {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </div>
      )}
      {hasPolygons ? (
        <MultiPolygonMap
          polygons={polygons}
          activePolygonIndex={0}
          height="350px"
        />
      ) : (
        <AbstractionPointMap
          latitude={latitude}
          longitude={longitude}
          readOnly
          height="350px"
        />
      )}
    </div>
  );
}
