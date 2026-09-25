"use client";

// =============================================
// Multi-Polygon Map (view-only)
// Rwanda Water Resources Board - Water Permit System
// =============================================

import { MapContainer, Marker, Polygon, Popup, ScaleControl, useMap } from "react-leaflet";
import BaseLayers from "@/components/maps/base-layers";
import L from "leaflet";
import { useEffect } from "react";
import type { Feature, Polygon as GeoPolygon } from "geojson";
import {
  coordinatesToGeoJSON,
  geoJSONToLeafletCoords,
  getPolygonSummary,
  type CoordinatePoint,
} from "@/lib/geoUtils";

// Palette for multi-polygon view — distinct, accessible colours
const POLYGON_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
];

function FitBounds({ coords }: { coords: CoordinatePoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length < 2) return;
    const valid = coords
      .map((c) => {
        const lat = typeof c.latitude === "string" ? parseFloat(c.latitude) : c.latitude;
        const lng = typeof c.longitude === "string" ? parseFloat(c.longitude) : c.longitude;
        return Number.isFinite(lat) && Number.isFinite(lng) ? ([lat, lng] as [number, number]) : null;
      })
      .filter((p): p is [number, number] => p !== null);
    if (valid.length >= 2) {
      map.fitBounds(L.latLngBounds(valid), { padding: [30, 30] });
    }
  }, [map, coords]);
  return null;
}

export interface MultiPolygonMapProps {
  polygons: CoordinatePoint[][];
  activePolygonIndex: number;
  height: string;
  /**
   * When true the map viewport is fitted to ALL polygon areas, not just the
   * active one.  Pass this when displaying a read-only permit view so that
   * every concession zone is visible.
   */
  fitAllPolygons?: boolean;
  /**
   * When true every polygon ring gets its own set of numbered vertex markers.
   * Useful for read-only permit views where there is no concept of an
   * "active" polygon.
   */
  showMarkersForAll?: boolean;
  /**
   * When true a metric scale bar is rendered in the bottom-left corner.
   * Used by the printable concession map so the printout carries a scale
   * indication.
   */
  showScale?: boolean;
}

export function MultiPolygonMap({
  polygons,
  activePolygonIndex,
  height,
  fitAllPolygons = false,
  showMarkersForAll = false,
  showScale = false,
}: MultiPolygonMapProps) {
  const rwandaCenter: [number, number] = [-1.9403, 29.8739];

  const active = polygons[activePolygonIndex] || [];
  const activeFeature = coordinatesToGeoJSON(active);

  // Flatten all polygon coordinates so FitBounds can encompass every ring
  const allCoords: CoordinatePoint[] = fitAllPolygons
    ? polygons.flat()
    : active;

  const otherPolys: Array<{ idx: number; feature: Feature<GeoPolygon> }> = [];
  polygons.forEach((p, idx) => {
    if (idx === activePolygonIndex) return;
    const f = coordinatesToGeoJSON(p);
    if (f) otherPolys.push({ idx, feature: f });
  });

  const getColor = (idx: number) =>
    POLYGON_COLORS[idx % POLYGON_COLORS.length];

  return (
    <div style={{ height }}>
      <MapContainer center={rwandaCenter} zoom={8} style={{ height: "100%", width: "100%" }} className="z-0">
        <BaseLayers />

        <FitBounds coords={allCoords} />

        {showScale && <ScaleControl position="bottomleft" imperial={false} />}

        {/* Markers for active polygon */}
        {active.map((coord, index) => {
          const lat = typeof coord.latitude === "string" ? parseFloat(coord.latitude) : coord.latitude;
          const lng = typeof coord.longitude === "string" ? parseFloat(coord.longitude) : coord.longitude;
          if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
          const color = getColor(activePolygonIndex);

          return (
            <Marker
              key={`active-${activePolygonIndex}-${index}`}
              position={[lat, lng]}
              icon={L.divIcon({
                html: `<div style="
                  width: 28px;
                  height: 28px;
                  background: ${color};
                  color: white;
                  border: 2px solid white;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-weight: bold;
                  font-size: 13px;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                ">${index + 1}</div>`,
                className: "custom-numbered-marker",
                iconSize: [28, 28],
                iconAnchor: [14, 14],
              })}
            >
              <Popup>
                <div className="text-sm">
                  <strong>Zone {activePolygonIndex + 1} — Point {index + 1}</strong>
                  <br />
                  Lat: {lat.toFixed(6)}
                  <br />
                  Lng: {lng.toFixed(6)}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Other polygon shapes */}
        {otherPolys.map(({ idx, feature }) => {
          const color = getColor(idx);
          return (
            <Polygon
              key={`poly-${idx}`}
              positions={geoJSONToLeafletCoords(feature)}
              pathOptions={{
                fillColor: color,
                color: color,
                weight: showMarkersForAll ? 2 : 1,
                opacity: showMarkersForAll ? 0.85 : 0.6,
                fillOpacity: showMarkersForAll ? 0.25 : 0.15,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <strong>Zone {idx + 1}</strong>
                  <br />
                  Area: {getPolygonSummary(feature).area}
                </div>
              </Popup>
            </Polygon>
          );
        })}

        {/* Vertex markers for other polygons (shown in showMarkersForAll mode) */}
        {showMarkersForAll &&
          otherPolys.map(({ idx }) => {
            const color = getColor(idx);
            return (polygons[idx] || []).map((coord, ptIdx) => {
              const lat =
                typeof coord.latitude === "string"
                  ? parseFloat(coord.latitude)
                  : coord.latitude;
              const lng =
                typeof coord.longitude === "string"
                  ? parseFloat(coord.longitude)
                  : coord.longitude;
              if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

              return (
                <Marker
                  key={`other-${idx}-${ptIdx}`}
                  position={[lat, lng]}
                  icon={L.divIcon({
                    html: `<div style="
                      width: 28px;
                      height: 28px;
                      background: ${color};
                      color: white;
                      border: 2px solid white;
                      border-radius: 50%;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      font-weight: bold;
                      font-size: 13px;
                      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                    ">${ptIdx + 1}</div>`,
                    className: "custom-numbered-marker",
                    iconSize: [28, 28],
                    iconAnchor: [14, 14],
                  })}
                >
                  <Popup>
                    <div className="text-sm">
                      <strong>Zone {idx + 1} — Point {ptIdx + 1}</strong>
                      <br />
                      Lat: {lat.toFixed(6)}
                      <br />
                      Lng: {lng.toFixed(6)}
                    </div>
                  </Popup>
                </Marker>
              );
            });
          })}

        {/* Active polygon shape */}
        {activeFeature && (
          <Polygon
            positions={geoJSONToLeafletCoords(activeFeature)}
            pathOptions={{
              fillColor: getColor(activePolygonIndex),
              color: getColor(activePolygonIndex),
              weight: 2,
              opacity: 0.85,
              fillOpacity: 0.25,
            }}
          >
            <Popup>
              <div className="text-sm">
                <strong>
                  Zone {activePolygonIndex + 1}
                  {!showMarkersForAll && " (active)"}
                </strong>
                <br />
                Area: {getPolygonSummary(activeFeature).area}
              </div>
            </Popup>
          </Polygon>
        )}
      </MapContainer>
    </div>
  );
}




