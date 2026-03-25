"use client";

import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import type { PublicWaterUseDashboardResponse } from "@/hooks/usePublicWaterUseDashboardQuery";

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => m.CircleMarker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });

type CatchmentPoint = PublicWaterUseDashboardResponse["map"]["catchments"][number];

const PURPOSE_LABELS: Record<string, string> = {
  domestic: "Domestic supply",
  irrigation: "Irrigation",
  industrial: "Industry",
  electricity_generation: "Hydropower",
  mining: "Mining",
  aquaculture: "Fish farming",
  fish_farming_lakes: "Fish farming (lakes)",
  fish_farming_ponds: "Fish farming (ponds)",
  recreation: "Recreation",
  municipal_supply: "Municipal supply",
  livestock: "Livestock",
  other: "Other",
};

const SOURCE_LABELS: Record<string, string> = {
  river: "Stream/River",
  stream: "Stream/River",
  lake: "Lake",
  groundwater: "Groundwater",
  borehole: "Groundwater (Borehole)",
  surface_water: "Dam/Reservoir",
  dam: "Dam/Reservoir",
  reservoir: "Dam/Reservoir",
  spring: "Spring",
  wetland: "Wetland",
  other: "Other",
};

function bubbleRadius(count: number, maxCount: number): number {
  // Scale from 8px (1 permit) to 36px (maxCount permits)
  const normalized = maxCount > 1 ? count / maxCount : 1;
  return 8 + Math.round(normalized * 28);
}

function bubbleColor(count: number, maxCount: number): string {
  const normalized = maxCount > 1 ? count / maxCount : 1;
  if (normalized > 0.66) return "#059669"; // emerald-600
  if (normalized > 0.33) return "#34d399"; // emerald-400
  return "#6ee7b7";                         // emerald-300
}

export function PublicPermitsMap({
  catchments,
  height = "520px",
}: {
  catchments: CatchmentPoint[];
  height?: string;
}) {
  const rwandaCenter: [number, number] = [-1.9403, 29.8739];
  const maxCount = Math.max(...catchments.map((c) => c.count), 1);

  return (
    <Card className="shadow-sm rounded-2xl bg-background/70 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          Water use map — by catchment
        </CardTitle>
        <CardDescription>
          Each bubble represents one catchment basin. Size reflects permit count.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div style={{ height }} className="w-full overflow-hidden rounded-b-2xl">
          <MapContainer center={rwandaCenter} zoom={8} style={{ height: "100%", width: "100%" }} className="z-0">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {catchments.map((c) => (
              <CircleMarker
                key={c.catchment}
                center={[c.lat, c.lng]}
                radius={bubbleRadius(c.count, maxCount)}
                pathOptions={{
                  fillColor: bubbleColor(c.count, maxCount),
                  color: "#ffffff",
                  weight: 2,
                  opacity: 0.9,
                  fillOpacity: 0.7,
                }}
              >
                <Popup>
                  <div className="min-w-[220px] space-y-2">
                    <div>
                      <div className="font-semibold text-base">{c.catchment}</div>
                      <div className="text-xs text-muted-foreground">Catchment basin</div>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">{c.count}</span> permit{c.count !== 1 ? "s" : ""}
                    </div>
                    {c.topPurpose && (
                      <div className="text-xs text-muted-foreground">
                        Top use: {PURPOSE_LABELS[c.topPurpose] ?? c.topPurpose}
                      </div>
                    )}
                    {c.topWaterSource && (
                      <div className="text-xs text-muted-foreground">
                        Top source: {SOURCE_LABELS[c.topWaterSource] ?? c.topWaterSource}
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
}
