"use client";

// =============================================
// Multi-Polygon Map (view-only)
// Rwanda Water Resources Board - Water Permit System
// =============================================

import { MapContainer, TileLayer, Marker, Polygon, Popup } from "react-leaflet";
import L from "leaflet";
import type { Feature, Polygon as GeoPolygon } from "geojson";
import {
  coordinatesToGeoJSON,
  geoJSONToLeafletCoords,
  getPolygonSummary,
  type CoordinatePoint,
} from "@/lib/geoUtils";

export interface MultiPolygonMapProps {
  polygons: CoordinatePoint[][];
  activePolygonIndex: number;
  height: string;
}

export function MultiPolygonMap({ polygons, activePolygonIndex, height }: MultiPolygonMapProps) {
  // Rwanda center coordinates
  const rwandaCenter: [number, number] = [-1.9403, 29.8739];

  const active = polygons[activePolygonIndex] || [];
  const activeFeature = coordinatesToGeoJSON(active);

  const otherPolys: Array<{ idx: number; feature: Feature<GeoPolygon> }> = [];
  polygons.forEach((p, idx) => {
    if (idx === activePolygonIndex) return;
    const f = coordinatesToGeoJSON(p);
    if (f) otherPolys.push({ idx, feature: f });
  });

  const getColor = (idx: number) => (idx === activePolygonIndex ? "#3b82f6" : "#6b7280");

  return (
    <div style={{ height }}>
      <MapContainer center={rwandaCenter} zoom={8} style={{ height: "100%", width: "100%" }} className="z-0">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Markers for active polygon */}
        {active.map((coord, index) => {
          const lat = typeof coord.latitude === "string" ? parseFloat(coord.latitude) : coord.latitude;
          const lng = typeof coord.longitude === "string" ? parseFloat(coord.longitude) : coord.longitude;
          if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

          return (
            <Marker
              key={`${activePolygonIndex}-${index}`}
              position={[lat, lng]}
              icon={L.divIcon({
                html: `<div style="
                  width: 28px;
                  height: 28px;
                  background: #3b82f6;
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
                  <strong>Polygon {activePolygonIndex + 1} — Point {index + 1}</strong>
                  <br />
                  Lat: {lat.toFixed(6)}
                  <br />
                  Lng: {lng.toFixed(6)}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Other polygons */}
        {otherPolys.map(({ idx, feature }) => (
          <Polygon
            key={`poly-${idx}`}
            positions={geoJSONToLeafletCoords(feature)}
            pathOptions={{
              fillColor: getColor(idx),
              color: getColor(idx),
              weight: 1,
              opacity: 0.6,
              fillOpacity: 0.15,
            }}
          >
            <Popup>
              <div className="text-sm">
                <strong>Polygon {idx + 1}</strong>
                <br />
                Area: {getPolygonSummary(feature).area}
              </div>
            </Popup>
          </Polygon>
        ))}

        {/* Active polygon */}
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
                <strong>Polygon {activePolygonIndex + 1} (active)</strong>
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


