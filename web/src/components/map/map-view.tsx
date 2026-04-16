"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeoJsonObject,
} from "geojson";
import maplibregl, {
  type ExpressionSpecification,
  type LngLatBoundsLike,
  type Map as MapLibreMap,
  type StyleSpecification,
} from "maplibre-gl";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { combineBboxes, expandBbox } from "@/lib/geo/bbox";
import { toFeatureCollection } from "@/lib/geo/serialization";

export type MapLayerTone = "neutral" | "info" | "success" | "warning" | "danger";

export type MapLayer = {
  id: string;
  label?: string;
  tone: MapLayerTone;
  geojson: GeoJsonObject | null | undefined;
  /** Optional explicit opacity override 0..1 */
  opacity?: number;
  /** When set, draw only the outline (no fill) */
  outlineOnly?: boolean;
  /** When set, dash the outline */
  dashed?: boolean;
};

export type MapViewProps = {
  layers: MapLayer[];
  /** Defaults to the combined bbox of every layer. */
  fitBbox?: [number, number, number, number] | null;
  /** Height in CSS units. Defaults to a responsive 360px. */
  height?: string;
  /** Custom style URL. Falls back to the bundled MapLibre demo tiles when unset. */
  styleUrl?: string | null;
  /** Short fallback note rendered inside the map surface when no geometry is provided. */
  emptyLabel?: string;
  ariaLabel?: string;
};

const TONE_COLORS: Record<MapLayerTone, { fill: string; stroke: string }> = {
  neutral: { fill: "#94a3b8", stroke: "#475569" },
  info: { fill: "#38bdf8", stroke: "#0369a1" },
  success: { fill: "#34d399", stroke: "#047857" },
  warning: { fill: "#f59e0b", stroke: "#b45309" },
  danger: { fill: "#f87171", stroke: "#b91c1c" },
};

const FALLBACK_STYLE: StyleSpecification = {
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

function resolveStyle(styleUrl: string | null | undefined): string | StyleSpecification {
  const envStyle = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL : undefined;
  if (styleUrl) return styleUrl;
  if (envStyle) return envStyle;
  return FALLBACK_STYLE;
}

function toFillLayer(id: string, sourceId: string, tone: MapLayerTone, opacity: number): maplibregl.FillLayerSpecification {
  return {
    id,
    type: "fill",
    source: sourceId,
    paint: {
      "fill-color": TONE_COLORS[tone].fill,
      "fill-opacity": opacity,
    },
    filter: ["in", "$type", "Polygon"] as unknown as ExpressionSpecification,
  };
}

function toLineLayer(
  id: string,
  sourceId: string,
  tone: MapLayerTone,
  dashed: boolean,
): maplibregl.LineLayerSpecification {
  const line: maplibregl.LineLayerSpecification = {
    id,
    type: "line",
    source: sourceId,
    paint: {
      "line-color": TONE_COLORS[tone].stroke,
      "line-width": 2,
    },
  };
  if (dashed) {
    (line.paint as Record<string, unknown>)["line-dasharray"] = [2, 2];
  }
  return line;
}

function toCircleLayer(id: string, sourceId: string, tone: MapLayerTone): maplibregl.CircleLayerSpecification {
  return {
    id,
    type: "circle",
    source: sourceId,
    paint: {
      "circle-color": TONE_COLORS[tone].fill,
      "circle-stroke-color": TONE_COLORS[tone].stroke,
      "circle-stroke-width": 1.5,
      "circle-radius": 4,
    },
    filter: ["in", "$type", "Point"] as unknown as ExpressionSpecification,
  };
}

function hasFeatures(layer: MapLayer): boolean {
  if (!layer.geojson) return false;
  if ((layer.geojson as Feature).type === "Feature") {
    return Boolean((layer.geojson as Feature).geometry);
  }
  if ((layer.geojson as FeatureCollection).type === "FeatureCollection") {
    return ((layer.geojson as FeatureCollection).features?.length ?? 0) > 0;
  }
  return true;
}

function asFeatureCollection(input: GeoJsonObject | null | undefined): FeatureCollection {
  if (!input) return { type: "FeatureCollection", features: [] };
  if ((input as FeatureCollection).type === "FeatureCollection") return input as FeatureCollection;
  if ((input as Feature).type === "Feature") {
    return { type: "FeatureCollection", features: [input as Feature] };
  }
  return toFeatureCollection([input as Geometry]);
}

export function MapView({
  layers,
  fitBbox,
  height = "360px",
  styleUrl,
  emptyLabel = "No spatial geometry available yet",
  ariaLabel = "Mission spatial preview",
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const descriptionId = useId();

  const resolvedStyle = useMemo(() => resolveStyle(styleUrl), [styleUrl]);
  const activeLayers = useMemo(() => layers.filter(hasFeatures), [layers]);

  const computedBbox = useMemo(() => {
    if (fitBbox) return fitBbox;
    const combined = combineBboxes(activeLayers.map((layer) => layer.geojson ?? null));
    if (!combined) return null;
    return expandBbox(combined, 0.15);
  }, [activeLayers, fitBbox]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (activeLayers.length === 0) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: resolvedStyle,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });

    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "imperial" }), "bottom-left");

    map.once("load", () => {
      activeLayers.forEach((layer) => {
        const sourceId = `src-${layer.id}`;
        const fc = asFeatureCollection(layer.geojson);
        if (map.getSource(sourceId)) return;
        map.addSource(sourceId, { type: "geojson", data: fc });
        const opacity = layer.opacity ?? (layer.outlineOnly ? 0 : 0.35);
        if (!layer.outlineOnly) {
          map.addLayer(toFillLayer(`${layer.id}-fill`, sourceId, layer.tone, opacity));
        }
        map.addLayer(toLineLayer(`${layer.id}-line`, sourceId, layer.tone, Boolean(layer.dashed)));
        map.addLayer(toCircleLayer(`${layer.id}-circle`, sourceId, layer.tone));
      });

      if (computedBbox) {
        map.fitBounds(computedBbox as LngLatBoundsLike, { padding: 32, duration: 0 });
      }
      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    activeLayers.forEach((layer) => {
      const sourceId = `src-${layer.id}`;
      const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      const fc = asFeatureCollection(layer.geojson);
      if (source) {
        source.setData(fc);
        return;
      }
      map.addSource(sourceId, { type: "geojson", data: fc });
      const opacity = layer.opacity ?? (layer.outlineOnly ? 0 : 0.35);
      if (!layer.outlineOnly) {
        map.addLayer(toFillLayer(`${layer.id}-fill`, sourceId, layer.tone, opacity));
      }
      map.addLayer(toLineLayer(`${layer.id}-line`, sourceId, layer.tone, Boolean(layer.dashed)));
      map.addLayer(toCircleLayer(`${layer.id}-circle`, sourceId, layer.tone));
    });

    if (computedBbox) {
      map.fitBounds(computedBbox as LngLatBoundsLike, { padding: 32, duration: 250 });
    }
  }, [activeLayers, computedBbox, ready]);

  if (activeLayers.length === 0) {
    return (
      <div
        className="map-view map-view--empty"
        role="img"
        aria-label={`${ariaLabel}: no geometry`}
        style={{ height }}
      >
        <p className="muted">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="map-view" aria-label={ariaLabel} aria-describedby={descriptionId}>
      <div ref={containerRef} className="map-view__canvas" style={{ height }} />
      <p id={descriptionId} className="sr-only">
        Interactive map showing {activeLayers.length} geometry {activeLayers.length === 1 ? "layer" : "layers"}:{" "}
        {activeLayers.map((l) => l.label ?? l.id).join(", ")}.
      </p>
    </div>
  );
}
