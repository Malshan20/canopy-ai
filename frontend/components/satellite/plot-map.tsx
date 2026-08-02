"use client";

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Circle,
  Tooltip,
  LayersControl,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import {
  SATELLITE_TILE_URL,
  SATELLITE_ATTRIBUTION,
  STREET_TILE_URL,
  STREET_ATTRIBUTION,
  gfwTreeCoverLossTileUrl,
  GFW_ATTRIBUTION,
} from "@/lib/gfw";

export interface PlotMarker {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  hasLoss: boolean;
  pending: boolean;
}

interface PlotMapProps {
  markers: PlotMarker[];
  activeId: string | null;
  onSelect?: (id: string) => void;
  /** Loss window for the GFW overlay; defaults from 2001 to the current year. */
  lossStartYear?: number;
}

const COLORS = {
  loss: "#dc2626",
  clean: "#10b981",
  pending: "#f59e0b",
};

/** Recenters/zooms the map when the active plot changes. */
function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 13), { animate: true });
  }, [lat, lng, map]);
  return null;
}

/**
 * A real satellite map. Esri World Imagery provides the basemap; the GFW
 * UMD tree-cover-loss raster is layered on top so post-2000 clearance is
 * visible directly on the imagery. Each plot is a colour-coded marker
 * (red = loss detected, green = clean, amber = pending), with a buffer
 * circle around the active plot showing the analysis footprint.
 *
 * Rendered client-only (Leaflet needs `window`) — the parent imports this
 * via `next/dynamic` with `ssr: false`.
 */
export default function PlotMap({ markers, activeId, onSelect, lossStartYear = 2001 }: PlotMapProps) {
  const active = markers.find((m) => m.id === activeId) ?? markers[0];
  const center: [number, number] = active
    ? [active.latitude, active.longitude]
    : [0, 20];
  const endYear = new Date().getFullYear();

  return (
    <MapContainer
      center={center}
      zoom={active ? 13 : 3}
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: "#0b1210" }}
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Satellite">
          <TileLayer url={SATELLITE_TILE_URL} attribution={SATELLITE_ATTRIBUTION} maxZoom={19} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Street">
          <TileLayer url={STREET_TILE_URL} attribution={STREET_ATTRIBUTION} maxZoom={19} />
        </LayersControl.BaseLayer>
        <LayersControl.Overlay checked name="GFW tree-cover loss">
          <TileLayer
            url={gfwTreeCoverLossTileUrl(lossStartYear, endYear, 30)}
            attribution={GFW_ATTRIBUTION}
            opacity={0.65}
            maxZoom={19}
          />
        </LayersControl.Overlay>
      </LayersControl>

      {active && <Recenter lat={active.latitude} lng={active.longitude} />}

      {markers.map((marker) => {
        const color = marker.pending ? COLORS.pending : marker.hasLoss ? COLORS.loss : COLORS.clean;
        const isActive = marker.id === active?.id;
        return (
          <CircleMarker
            key={marker.id}
            center={[marker.latitude, marker.longitude]}
            radius={isActive ? 9 : 6}
            pathOptions={{
              color: "#ffffff",
              weight: isActive ? 2 : 1,
              fillColor: color,
              fillOpacity: 0.9,
            }}
            eventHandlers={{ click: () => onSelect?.(marker.id) }}
          >
            <Tooltip>{marker.label}</Tooltip>
          </CircleMarker>
        );
      })}

      {active && (
        <Circle
          center={[active.latitude, active.longitude]}
          radius={140}
          pathOptions={{
            color: active.hasLoss ? COLORS.loss : COLORS.clean,
            weight: 1,
            fillOpacity: 0.06,
            dashArray: "4 4",
          }}
        />
      )}
    </MapContainer>
  );
}
