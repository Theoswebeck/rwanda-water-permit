"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { AbstractionPointMapProps } from "@/components/maps/AbstractionPointMap";
import type { AppLanguage } from "@/lib/i18n/language";
import { getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";

const AbstractionPointMap = dynamic<AbstractionPointMapProps>(
  () => import("@/components/maps/AbstractionPointMap").then((m) => m.AbstractionPointMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[350px] w-full items-center justify-center rounded-lg border bg-slate-50">
        <span className="text-sm text-slate-400">Loading map…</span>
      </div>
    ),
  }
);

interface PermitLocationMapProps {
  latitude: number | null;
  longitude: number | null;
}

export function PermitLocationMap({ latitude, longitude }: PermitLocationMapProps) {
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

  if (!hasCoordinates) {
    return null;
  }

  return (
    <div className="mt-6 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {tx("Permit Map Location")}
      </h3>
      <div className="text-sm text-slate-700">
        {tx("Coordinates:")} {latitude.toFixed(6)}, {longitude.toFixed(6)}
      </div>
      <AbstractionPointMap
        latitude={latitude}
        longitude={longitude}
        readOnly
        height="350px"
      />
    </div>
  );
}
