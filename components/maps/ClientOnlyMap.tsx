"use client";

// =============================================
// Client-Only Map Component
// Rwanda Water Resources Board - Water Permit System
// =============================================

import { MapContainer, TileLayer, Marker, Polygon, Popup, useMapEvents } from "react-leaflet";
import L from 'leaflet';
import { Badge } from "@/components/ui/badge";
import { 
  geoJSONToLeafletCoords,
  formatArea,
  getPolygonSummary,
  type CoordinatePoint 
} from "@/lib/geoUtils";
import type { Feature, Polygon as GeoPolygon } from 'geojson';

// =============================================
// TYPES
// =============================================

export interface ClientOnlyMapProps {
  coordinates: CoordinatePoint[];
  currentPolygon: Feature<GeoPolygon> | null;
  existingPermits: ExistingPermit[];
  showPermits: boolean;
  validation: any;
  onMapClick: (lat: number, lng: number) => void;
  isDrawing: boolean;
  height: string;
}

interface ExistingPermit {
  permitId: string;
  permitNumber: string;
  projectTitle: string;
  coordinates: [number, number][];
  status: string;
}

// =============================================
// MAP INTERACTION COMPONENT
// =============================================

function MapClickHandler({ 
  onMapClick, 
  isDrawing 
}: { 
  onMapClick: (lat: number, lng: number) => void;
  isDrawing: boolean;
}) {
  useMapEvents({
    click: (e) => {
      if (isDrawing) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

// =============================================
// MAIN COMPONENT
// =============================================

export default function ClientOnlyMap({
  coordinates,
  currentPolygon,
  existingPermits,
  showPermits,
  validation,
  onMapClick,
  isDrawing,
  height
}: ClientOnlyMapProps) {
  // Rwanda center coordinates
  const rwandaCenter: [number, number] = [-1.9403, 29.8739];

  const getPolygonColor = () => {
    if (!validation) return '#3b82f6'; // Blue for no validation
    return validation.isValid ? '#10b981' : '#ef4444'; // Green for valid, red for invalid
  };

  const getPermitPolygonColor = (status: string) => {
    switch (status) {
      case 'active': return '#6366f1'; // Indigo
      case 'expiring_soon': return '#f59e0b'; // Amber
      default: return '#6b7280'; // Gray
    }
  };

  return (
    <MapContainer
      center={rwandaCenter}
      zoom={8}
      style={{ height: '100%', width: '100%' }}
      className="z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      <MapClickHandler onMapClick={onMapClick} isDrawing={isDrawing} />
      
      {/* Current coordinate markers */}
      {coordinates.map((coord, index) => {
        const lat = typeof coord.latitude === 'string' ? parseFloat(coord.latitude) : coord.latitude;
        const lng = typeof coord.longitude === 'string' ? parseFloat(coord.longitude) : coord.longitude;
        
        if (isNaN(lat) || isNaN(lng)) return null;
        
        return (
          <Marker
            key={index}
            position={[lat, lng]}
            icon={L.divIcon({
              html: `<div style="
                width: 30px; 
                height: 30px; 
                background: #3b82f6; 
                color: white; 
                border: 2px solid white; 
                border-radius: 50%; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                font-weight: bold; 
                font-size: 14px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
              ">${index + 1}</div>`,
              className: 'custom-numbered-marker',
              iconSize: [30, 30],
              iconAnchor: [15, 15]
            })}
          >
            <Popup>
              <div className="text-sm">
                <strong>Point {index + 1}</strong><br />
                Lat: {lat.toFixed(6)}<br />
                Lng: {lng.toFixed(6)}
              </div>
            </Popup>
          </Marker>
        );
      })}
      
      {/* Current polygon */}
      {currentPolygon && (
        <Polygon
          positions={geoJSONToLeafletCoords(currentPolygon)}
          pathOptions={{
            fillColor: getPolygonColor(),
            color: getPolygonColor(),
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.3
          }}
        >
          <Popup>
            <div className="text-sm">
              <strong>Your Application Area</strong><br />
              {currentPolygon && (
                <>
                  Area: {getPolygonSummary(currentPolygon).area}<br />
                  Status: {validation?.isValid ? 'Valid' : 'Invalid'}<br />
                  {validation?.intersections.length ? (
                    <>Conflicts: {validation.intersections.length}</>
                  ) : null}
                </>
              )}
            </div>
          </Popup>
        </Polygon>
      )}
      
      {/* Existing permits */}
      {showPermits && existingPermits.map((permit) => (
        <Polygon
          key={permit.permitId}
          positions={permit.coordinates}
          pathOptions={{
            fillColor: getPermitPolygonColor(permit.status),
            color: getPermitPolygonColor(permit.status),
            weight: 1,
            opacity: 0.6,
            fillOpacity: 0.2
          }}
        >
          <Popup>
            <div className="text-sm">
              <strong>{permit.permitNumber}</strong><br />
              {permit.projectTitle}<br />
              Status: <Badge variant="outline" className="text-xs">
                {permit.status}
              </Badge>
            </div>
          </Popup>
        </Polygon>
      ))}
    </MapContainer>
  );
}
