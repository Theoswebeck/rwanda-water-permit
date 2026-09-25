"use client";

import { LayersControl, LayerGroup, TileLayer } from "react-leaflet";

// Street / Satellite switcher shared by every Leaflet map. Esri imagery is keyless;
// the reference overlay puts place names and boundaries back on top of it.
export default function BaseLayers() {
  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked name="Street">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Satellite">
        <LayerGroup>
          <TileLayer
            attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={19}
            maxZoom={22}
          />
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={19}
            maxZoom={22}
          />
        </LayerGroup>
      </LayersControl.BaseLayer>
    </LayersControl>
  );
}
