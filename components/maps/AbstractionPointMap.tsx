"use client";

// =============================================
// Abstraction Point Map
// Rwanda Water Resources Board - Water Permit System
// Single-point map for water abstraction coordinates (LAT/LONG)
// =============================================

import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";

export interface AbstractionPointMapProps {
  latitude: string | number | null | undefined;
  longitude: string | number | null | undefined;
  onPointChange?: (lat: string, lng: string) => void;
  readOnly?: boolean;
  height?: string;
  className?: string;
}

function MapClickHandler({
  onPointChange,
  readOnly,
}: {
  onPointChange?: (lat: string, lng: string) => void;
  readOnly?: boolean;
}) {
  useMapEvents({
    click: (e) => {
      if (!readOnly && onPointChange) {
        onPointChange(String(e.latlng.lat.toFixed(6)), String(e.latlng.lng.toFixed(6)));
      }
    },
  });
  return null;
}

export function AbstractionPointMap({
  latitude,
  longitude,
  onPointChange,
  readOnly = false,
  height = "400px",
  className = "",
}: AbstractionPointMapProps) {
  const lat = typeof latitude === "string" ? parseFloat(latitude) : latitude;
  const lng = typeof longitude === "string" ? parseFloat(longitude) : longitude;
  const hasValidPoint = typeof lat === "number" && !Number.isNaN(lat) && typeof lng === "number" && !Number.isNaN(lng);

  // Rwanda center or point location
  const rwandaCenter: [number, number] = [-1.9403, 29.8739];
  const center: [number, number] = hasValidPoint ? [lat, lng] : rwandaCenter;

  return (
    <div style={{ height }} className={`w-full rounded-lg overflow-hidden border ${className}`}>
      <MapContainer
        center={center}
        zoom={hasValidPoint ? 14 : 8}
        style={{ height: "100%", width: "100%" }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapClickHandler onPointChange={onPointChange} readOnly={readOnly} />

        {hasValidPoint && (
          <Marker
            position={[lat, lng]}
            icon={L.divIcon({
              html: `<div style="
                width: 36px;
                height: 36px;
                background: #059669;
                color: white;
                border: 2px solid white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 16px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
              ">W</div>`,
              className: "custom-abstraction-marker",
              iconSize: [36, 36],
              iconAnchor: [18, 18],
            })}
          >
            <Popup>
              <div className="text-sm">
                <strong>Water Abstraction Point</strong>
                <br />
                Lat: {lat.toFixed(6)}
                <br />
                Lng: {lng.toFixed(6)}
                {!readOnly && onPointChange && (
                  <>
                    <br />
                    <span className="text-muted-foreground text-xs">Click elsewhere on the map to move</span>
                  </>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
