"use client";

import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import type { PublicWaterUseDashboardResponse } from "@/hooks/usePublicWaterUseDashboardQuery";

// Dynamic Leaflet imports (avoid SSR)
const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => m.CircleMarker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });

type Point = PublicWaterUseDashboardResponse["map"]["points"][number];

const INTENSITY_STYLE: Record<Point["intensity"], { label: string; color: string }> = {
  very_low: { label: "Very low", color: "#cbd5e1" }, // slate-300
  low: { label: "Low", color: "#94a3b8" }, // slate-400
  medium: { label: "Medium", color: "#60a5fa" }, // blue-400
  high: { label: "High", color: "#f59e0b" }, // amber-500
  very_high: { label: "Very high", color: "#ef4444" }, // red-500
};

function radiusFromIntensity(i: Point["intensity"]) {
  switch (i) {
    case "very_low":
      return 4;
    case "low":
      return 6;
    case "medium":
      return 8;
    case "high":
      return 10;
    case "very_high":
      return 12;
  }
}

export function PublicPermitsMap({ points, height = "520px" }: { points: Point[]; height?: string }) {
  const rwandaCenter: [number, number] = [-1.9403, 29.8739];
  const plotted = points.filter((p) => typeof p.lat === "number" && typeof p.lng === "number") as Array<Point & { lat: number; lng: number }>;

  return (
    <Card className="shadow-sm rounded-2xl bg-background/70 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          Water use map (public)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div style={{ height }} className="w-full overflow-hidden rounded-b-2xl">
          <MapContainer center={rwandaCenter} zoom={8} style={{ height: "100%", width: "100%" }} className="z-0">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {plotted.map((p) => {
              const style = INTENSITY_STYLE[p.intensity];
              return (
                <CircleMarker
                  key={p.permitId}
                  center={[p.lat, p.lng]}
                  radius={radiusFromIntensity(p.intensity)}
                  pathOptions={{
                    fillColor: style.color,
                    color: "#ffffff",
                    weight: 2,
                    opacity: 0.9,
                    fillOpacity: 0.75,
                  }}
                >
                  <Popup>
                    <div className="min-w-[260px] space-y-2">
                      <div>
                        <div className="font-semibold">{p.permitNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.district ?? "N/A"}, {p.province ?? "N/A"} • {p.sector ?? "N/A"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{p.useType}</Badge>
                        <Badge variant="outline">{p.waterSource}</Badge>
                        <Badge variant="outline">{INTENSITY_STYLE[p.intensity].label} intensity</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Catchment: {p.catchment1 ?? "N/A"}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
}


