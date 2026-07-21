"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Geometry, Polygon } from "geojson";
import maplibregl, { type LngLatBoundsLike, type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { TerraDraw, TerraDrawPolygonMode } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";

import { computeBbox, expandBbox } from "@/lib/geo/bbox";

import { resolveMapStyle } from "./base-style";

/** Grass Valley, CA — matches the sample geometries used across the app. */
const DEFAULT_CENTER: [number, number] = [-121.05, 39.2275];
const DEFAULT_ZOOM = 12;

type GeometryDrawMapProps = {
  /** Saved/pasted geometry rendered as a read-only underlay. */
  existingGeometry?: Geometry | null;
  /** Fired when a polygon is completed or the drawing is cleared. */
  onDraw: (polygon: Polygon | null) => void;
  height?: string;
  ariaLabel?: string;
};

export function GeometryDrawMap({
  existingGeometry = null,
  onDraw,
  height = "320px",
  ariaLabel = "Draw the area of interest on the map",
}: GeometryDrawMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const onDrawRef = useRef(onDraw);
  const existingRef = useRef(existingGeometry);

  useEffect(() => {
    onDrawRef.current = onDraw;
  }, [onDraw]);
  const [ready, setReady] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: resolveMapStyle(),
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "imperial" }), "bottom-left");

    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [new TerraDrawPolygonMode()],
    });
    drawRef.current = draw;

    map.once("load", () => {
      map.addSource("existing-geometry", {
        type: "geojson",
        data: existingRef.current
          ? { type: "Feature", geometry: existingRef.current, properties: {} }
          : { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "existing-geometry-fill",
        type: "fill",
        source: "existing-geometry",
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "existing-geometry-line",
        type: "line",
        source: "existing-geometry",
        paint: { "line-color": "#2563eb", "line-width": 2, "line-dasharray": [2, 2] },
      });

      if (existingRef.current) {
        const bbox = computeBbox(existingRef.current);
        if (bbox) {
          map.fitBounds(expandBbox(bbox, 0.25) as LngLatBoundsLike, { padding: 32, duration: 0 });
        }
      }

      draw.start();
      draw.setMode("polygon");

      draw.on("finish", (finishedId, context) => {
        if (context.action !== "draw") return;
        const snapshot = draw.getSnapshot();
        const finished = snapshot.find((feature) => feature.id === finishedId);
        // Keep only the polygon just completed — one AOI per field.
        const staleIds = snapshot
          .map((feature) => feature.id)
          .filter((id): id is string | number => id !== undefined && id !== finishedId);
        if (staleIds.length > 0) {
          draw.removeFeatures(staleIds);
        }
        if (finished && finished.geometry.type === "Polygon") {
          setHasDrawing(true);
          onDrawRef.current(finished.geometry as Polygon);
        }
      });

      setReady(true);
    });

    return () => {
      try {
        draw.stop();
      } catch {
        // adapter may already be detached during teardown
      }
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    existingRef.current = existingGeometry;
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("existing-geometry") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(
      existingGeometry
        ? { type: "Feature", geometry: existingGeometry, properties: {} }
        : { type: "FeatureCollection", features: [] },
    );
  }, [existingGeometry, ready]);

  const clearDrawing = () => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.clear();
    draw.setMode("polygon");
    setHasDrawing(false);
    onDrawRef.current(null);
  };

  return (
    <div className="stack-xs">
      <div className="map-view" aria-label={ariaLabel}>
        <div ref={containerRef} className="map-view__canvas" style={{ height }} />
      </div>
      <div className="header-actions">
        <span className="muted helper-copy">
          Click the map to place vertices; click the first vertex again to close the polygon.
        </span>
        <button
          type="button"
          className="button button-secondary"
          onClick={clearDrawing}
          disabled={!hasDrawing}
        >
          Clear drawing
        </button>
      </div>
    </div>
  );
}
