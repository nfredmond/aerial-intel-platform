"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl, {
  type LngLatBoundsLike,
  type Map as MapLibreMap,
  type StyleSpecification,
} from "maplibre-gl";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type RasterViewerProps = {
  tileUrlTemplate: string;
  bounds?: [number, number, number, number] | null;
  label?: string;
  attribution?: string;
  height?: string;
  ariaLabel?: string;
};

const FALLBACK_BASEMAP: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
    },
  ],
};

function resolveBaseStyle(): string | StyleSpecification {
  const envStyle =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL
      : undefined;
  return envStyle ?? FALLBACK_BASEMAP;
}

const OVERLAY_SOURCE_ID = "titiler-overlay";
const OVERLAY_LAYER_ID = "titiler-overlay-layer";

export function RasterViewer({
  tileUrlTemplate,
  bounds,
  label,
  attribution,
  height = "420px",
  ariaLabel = "Raster artifact preview",
}: RasterViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [opacity, setOpacity] = useState(0.9);
  const descriptionId = useId();
  const opacityId = useId();

  const baseStyle = useMemo(() => resolveBaseStyle(), []);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: baseStyle,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: false }),
      "top-right",
    );
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 120, unit: "imperial" }),
      "bottom-left",
    );

    map.once("load", () => {
      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [baseStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (map.getLayer(OVERLAY_LAYER_ID)) {
      map.removeLayer(OVERLAY_LAYER_ID);
    }
    if (map.getSource(OVERLAY_SOURCE_ID)) {
      map.removeSource(OVERLAY_SOURCE_ID);
    }

    map.addSource(OVERLAY_SOURCE_ID, {
      type: "raster",
      tiles: [tileUrlTemplate],
      tileSize: 256,
      attribution: attribution ?? "TiTiler",
    });

    map.addLayer({
      id: OVERLAY_LAYER_ID,
      type: "raster",
      source: OVERLAY_SOURCE_ID,
      paint: {
        "raster-opacity": opacity,
      },
    });

    if (bounds && bounds.length === 4) {
      map.fitBounds(bounds as LngLatBoundsLike, {
        padding: 32,
        duration: 250,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileUrlTemplate, ready, attribution, bounds?.join(",")]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!map.getLayer(OVERLAY_LAYER_ID)) return;
    map.setPaintProperty(OVERLAY_LAYER_ID, "raster-opacity", opacity);
  }, [opacity, ready]);

  return (
    <div className="raster-viewer" aria-label={ariaLabel} aria-describedby={descriptionId}>
      <div
        ref={containerRef}
        className="raster-viewer__canvas"
        style={{ height, width: "100%", borderRadius: "8px", overflow: "hidden" }}
      />
      <div className="raster-viewer__controls" style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <label htmlFor={opacityId} style={{ fontSize: "0.875rem" }}>
          Overlay opacity
        </label>
        <input
          id={opacityId}
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(event) => setOpacity(Number(event.target.value))}
          aria-valuetext={`${Math.round(opacity * 100)}%`}
          style={{ flex: 1 }}
        />
        <span style={{ fontVariantNumeric: "tabular-nums", minWidth: "3ch", textAlign: "right" }}>
          {Math.round(opacity * 100)}%
        </span>
      </div>
      <p id={descriptionId} className="sr-only">
        Interactive raster preview{label ? ` for ${label}` : ""} rendered via TiTiler tiles.
      </p>
    </div>
  );
}
