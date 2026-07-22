"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { decodeLaz, elevationColor, type Vec3 } from "@/lib/pointcloud/laz";
import {
  estimateVolume,
  horizontalDistance,
  planArea,
  planPerimeter,
  pickNearestPointToRay,
  slopeDistance,
  verticalDelta,
  type P3,
  type VolumeEstimate,
} from "@/lib/pointcloud/measure";

export type PointCloudViewerProps = {
  signedUrl: string;
  wasmUrl?: string;
  label?: string;
  height?: string;
  ariaLabel?: string;
  maxPoints?: number;
};

type MeasureMode = "orbit" | "distance" | "area" | "volume";
type ColorMode = "rgb" | "elevation";

type ViewerStats = {
  rendered: number;
  total: number;
  hasRgb: boolean;
};

type CloudRefs = {
  positions: Float32Array;
  rgbColors: Float32Array | null;
  elevationColors: Float32Array;
  center: Vec3;
  boundingRadius: number;
};

const DEFAULT_POINT_SIZE = 2;

const MODE_ACCENT: Record<Exclude<MeasureMode, "orbit">, number> = {
  distance: 0xffd166,
  area: 0x4cc9f0,
  volume: 0xf72585,
};

const MODE_HINT: Record<MeasureMode, string> = {
  orbit: "Drag to orbit · scroll to zoom · right-drag to pan.",
  distance: "Click two points to measure distance. Click again to restart.",
  area: "Click to add polygon points, then Finish for plan area.",
  volume: "Click to outline a region, then Finish for cut/fill volume.",
};

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function formatMeters(value: number): string {
  return `${value.toFixed(2)} m`;
}

function formatArea(value: number): string {
  if (value >= 10_000) return `${value.toFixed(1)} m² (${(value / 10_000).toFixed(3)} ha)`;
  return `${value.toFixed(2)} m²`;
}

function formatVolume(value: number): string {
  return `${value.toFixed(1)} m³`;
}

/** Convert a local viewer point back to world UTM easting/northing/elevation. */
function toWorld(local: P3, center: Vec3): { easting: number; northing: number; elevation: number } {
  return {
    easting: local.x + center[0],
    northing: center[1] - local.z,
    elevation: local.y + center[2],
  };
}

export function PointCloudViewer({
  signedUrl,
  wasmUrl = "/laz-perf.wasm",
  label,
  height = "480px",
  ariaLabel = "Point cloud preview",
  maxPoints,
}: PointCloudViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const materialRef = useRef<THREE.PointsMaterial | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const measureGroupRef = useRef<THREE.Group | null>(null);
  const cloudRef = useRef<CloudRefs | null>(null);
  // Two persistent color attributes reused across toggles so three.js never
  // orphans a GPU buffer (a fresh BufferAttribute per swap would leak).
  const rgbAttrRef = useRef<THREE.BufferAttribute | null>(null);
  const elevAttrRef = useRef<THREE.BufferAttribute | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<ViewerStats | null>(null);
  const [pointSize, setPointSize] = useState(DEFAULT_POINT_SIZE);
  const pointSizeRef = useRef(pointSize);
  const [colorMode, setColorMode] = useState<ColorMode>("rgb");
  const [mode, setMode] = useState<MeasureMode>("orbit");
  const [vertices, setVertices] = useState<P3[]>([]);
  const [closed, setClosed] = useState(false);
  const [focused, setFocused] = useState(false);

  const descriptionId = useId();
  const sizeId = useId();

  // --- Scene lifecycle -----------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let points: THREE.Points | undefined;
    let frame = 0;

    setStatus("loading");
    setErrorMessage(null);
    setVertices([]);
    setClosed(false);
    setMode("orbit");

    (async () => {
      try {
        const [dataResponse, wasmResponse] = await Promise.all([
          fetch(signedUrl, { cache: "no-store" }),
          fetch(wasmUrl, { cache: "force-cache" }),
        ]);
        if (!dataResponse.ok) {
          throw new Error(`Could not download the point cloud (${dataResponse.status}).`);
        }
        if (!wasmResponse.ok) {
          throw new Error(`Could not load the point-cloud decoder (${wasmResponse.status}).`);
        }
        const [dataBuffer, wasmBinary] = await Promise.all([
          dataResponse.arrayBuffer(),
          wasmResponse.arrayBuffer(),
        ]);
        if (disposed) return;

        const cloud = await decodeLaz(new Uint8Array(dataBuffer), { wasmBinary, maxPoints });
        if (disposed) return;
        if (cloud.renderedCount === 0) {
          throw new Error("The point cloud contains no points to render.");
        }

        // Precompute an elevation ramp so switching color modes is instant, and
        // retain the true-color buffer when the cloud has RGB.
        const hasRgb = cloud.colorMode === "rgb";
        const elevationColors = buildElevationColors(cloud.positions);
        cloudRef.current = {
          positions: cloud.positions,
          rgbColors: hasRgb ? cloud.colors : null,
          elevationColors,
          center: cloud.center,
          boundingRadius: cloud.boundingRadius,
        };

        const width = container.clientWidth || 640;
        const heightPx = container.clientHeight || 480;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b1020);

        const camera = new THREE.PerspectiveCamera(
          60,
          width / heightPx,
          Math.max(cloud.boundingRadius / 1000, 0.05),
          cloud.boundingRadius * 100,
        );
        const viewDirection = new THREE.Vector3(0.7, 0.6, 0.7).normalize();
        camera.position.copy(viewDirection.multiplyScalar(cloud.boundingRadius * 1.6));
        cameraRef.current = camera;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(cloud.positions, 3));
        const elevAttr = new THREE.BufferAttribute(elevationColors, 3);
        const rgbAttr = hasRgb ? new THREE.BufferAttribute(cloud.colors, 3) : null;
        elevAttrRef.current = elevAttr;
        rgbAttrRef.current = rgbAttr;
        geometry.setAttribute("color", rgbAttr ?? elevAttr);
        geometry.computeBoundingSphere();
        geometryRef.current = geometry;

        const material = new THREE.PointsMaterial({
          size: pointSizeRef.current,
          sizeAttenuation: false,
          vertexColors: true,
        });
        materialRef.current = material;

        points = new THREE.Points(geometry, material);
        scene.add(points);

        const measureGroup = new THREE.Group();
        scene.add(measureGroup);
        measureGroupRef.current = measureGroup;

        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, heightPx);
        renderer.domElement.style.display = "block";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = cloud.boundingRadius * 0.15;
        controls.maxDistance = cloud.boundingRadius * 12;
        controls.target.set(0, 0, 0);
        controls.update();
        controlsRef.current = controls;

        const animate = () => {
          frame = requestAnimationFrame(animate);
          controls?.update();
          renderer?.render(scene, camera);
        };
        animate();

        resizeObserver = new ResizeObserver(() => {
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (!w || !h || !renderer) return;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        });
        resizeObserver.observe(container);

        setColorMode(hasRgb ? "rgb" : "elevation");
        setStats({ rendered: cloud.renderedCount, total: cloud.totalCount, hasRgb });
        setStatus("ready");
      } catch (error) {
        if (disposed) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Could not render the point cloud.",
        );
        setStatus("error");
      }
    })();

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      controls?.dispose();
      if (measureGroupRef.current) {
        disposeGroup(measureGroupRef.current);
        measureGroupRef.current = null;
      }
      if (points) {
        points.geometry.dispose();
        (points.material as THREE.Material).dispose();
      }
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
      materialRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      geometryRef.current = null;
      cloudRef.current = null;
      rgbAttrRef.current = null;
      elevAttrRef.current = null;
    };
  }, [signedUrl, wasmUrl, maxPoints]);

  // --- Point size ----------------------------------------------------------
  useEffect(() => {
    pointSizeRef.current = pointSize;
    if (materialRef.current) materialRef.current.size = pointSize;
  }, [pointSize]);

  // --- Color mode ----------------------------------------------------------
  useEffect(() => {
    if (status !== "ready") return;
    const geometry = geometryRef.current;
    if (!geometry) return;
    // Swap between two persistent attributes; never allocate a new one (that
    // would orphan the previous GL buffer and leak GPU memory per toggle).
    const chosen =
      colorMode === "rgb" && rgbAttrRef.current ? rgbAttrRef.current : elevAttrRef.current;
    if (!chosen || geometry.getAttribute("color") === chosen) return;
    geometry.setAttribute("color", chosen);
    chosen.needsUpdate = true;
  }, [colorMode, status]);

  // --- Picking (attach per mode) ------------------------------------------
  const applyPick = useCallback(
    (point: P3) => {
      if (mode === "distance") {
        setVertices((prev) => (prev.length >= 2 ? [point] : [...prev, point]));
        return;
      }
      // area / volume
      if (closed) {
        setClosed(false);
        setVertices([point]);
        return;
      }
      setVertices((prev) => [...prev, point]);
    },
    [mode, closed],
  );

  useEffect(() => {
    if (status !== "ready" || mode === "orbit") return;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const cloud = cloudRef.current;
    if (!renderer || !camera || !cloud) return;
    const dom = renderer.domElement;
    const raycaster = (raycasterRef.current ??= new THREE.Raycaster());

    let downX = 0;
    let downY = 0;
    let downId = -1;
    const onDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
      downId = event.pointerId;
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== downId) return;
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) return; // a drag → orbit
      const rect = dom.getBoundingClientRect();
      const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const pick = pickNearestPointToRay(
        cloud.positions,
        raycaster.ray.origin,
        raycaster.ray.direction,
        cloud.boundingRadius * 0.08,
      );
      if (pick) applyPick(pick.point);
    };

    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointerup", onUp);
    };
  }, [status, mode, applyPick]);

  // --- Measurement graphics -----------------------------------------------
  useEffect(() => {
    if (status !== "ready") return;
    const group = measureGroupRef.current;
    const cloud = cloudRef.current;
    if (!group || !cloud) return;

    disposeGroup(group);
    if (mode === "orbit" || vertices.length === 0) return;

    const accent = MODE_ACCENT[mode];
    const radius = Math.max(cloud.boundingRadius * 0.012, 1e-4);
    const sphereGeo = new THREE.SphereGeometry(radius, 12, 12);
    const sphereMat = new THREE.MeshBasicMaterial({ color: accent });
    for (const v of vertices) {
      const marker = new THREE.Mesh(sphereGeo, sphereMat);
      marker.position.set(v.x, v.y, v.z);
      group.add(marker);
    }

    const linePoints = vertices.map((v) => new THREE.Vector3(v.x, v.y, v.z));
    const isPolygon = (mode === "area" || mode === "volume") && closed && vertices.length >= 3;
    if (isPolygon) linePoints.push(linePoints[0].clone());
    if (linePoints.length >= 2) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
      const lineMat = new THREE.LineBasicMaterial({ color: accent });
      group.add(new THREE.Line(lineGeo, lineMat));
    }
  }, [status, mode, vertices, closed]);

  // --- Derived measurement results ----------------------------------------
  const distanceResult = useMemo(() => {
    if (mode !== "distance" || vertices.length < 2) return null;
    const [a, b] = vertices;
    return {
      slope: slopeDistance(a, b),
      horizontal: horizontalDistance(a, b),
      vertical: verticalDelta(a, b),
    };
  }, [mode, vertices]);

  const areaResult = useMemo(() => {
    if (mode !== "area" || !closed || vertices.length < 3) return null;
    return { area: planArea(vertices), perimeter: planPerimeter(vertices) };
  }, [mode, closed, vertices]);

  const volumeResult = useMemo<VolumeEstimate | null>(() => {
    if (mode !== "volume" || !closed || vertices.length < 3) return null;
    const cloud = cloudRef.current;
    if (!cloud) return null;
    return estimateVolume(cloud.positions, vertices);
  }, [mode, closed, vertices]);

  const lastVertexWorld = useMemo(() => {
    const cloud = cloudRef.current;
    if (!cloud || vertices.length === 0) return null;
    return toWorld(vertices[vertices.length - 1], cloud.center);
  }, [vertices]);

  const canFinish = (mode === "area" || mode === "volume") && !closed && vertices.length >= 3;
  const decimated = stats ? stats.rendered < stats.total : false;

  const selectMode = (next: MeasureMode) => {
    if (next === mode) return; // re-clicking the active mode must not discard work
    setMode(next);
    setVertices([]);
    setClosed(false);
  };

  const finishMeasurement = () => {
    setClosed(true);
    // Finish disappears when canFinish flips false; return focus to the viewer
    // so keyboard users keep an anchor instead of dropping to <body>.
    frameRef.current?.focus();
  };

  // --- Keyboard operability (orbit + place at reticle) --------------------
  const orbitBy = (dTheta: number, dPhi: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += dTheta;
    spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi + dPhi));
    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  };

  const dollyBy = (factor: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const offset = camera.position.clone().sub(controls.target);
    const distance = Math.max(
      controls.minDistance,
      Math.min(controls.maxDistance, offset.length() * factor),
    );
    offset.setLength(distance);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  };

  const placeAtReticle = () => {
    const camera = cameraRef.current;
    const cloud = cloudRef.current;
    if (!camera || !cloud) return;
    const raycaster = (raycasterRef.current ??= new THREE.Raycaster());
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera); // viewport center
    const pick = pickNearestPointToRay(
      cloud.positions,
      raycaster.ray.origin,
      raycaster.ray.direction,
      cloud.boundingRadius * 0.12,
    );
    if (pick) applyPick(pick.point);
  };

  const onFrameKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (status !== "ready") return;
    const rotStep = 0.14;
    switch (event.key) {
      case "ArrowLeft": orbitBy(-rotStep, 0); event.preventDefault(); break;
      case "ArrowRight": orbitBy(rotStep, 0); event.preventDefault(); break;
      case "ArrowUp": orbitBy(0, -rotStep); event.preventDefault(); break;
      case "ArrowDown": orbitBy(0, rotStep); event.preventDefault(); break;
      case "+": case "=": dollyBy(0.9); event.preventDefault(); break;
      case "-": case "_": dollyBy(1.1); event.preventDefault(); break;
      case "Enter": case " ":
        if (mode !== "orbit") { placeAtReticle(); event.preventDefault(); }
        break;
      case "Backspace":
        if (mode !== "orbit" && vertices.length > 0) {
          setVertices((prev) => prev.slice(0, -1));
          setClosed(false);
          event.preventDefault();
        }
        break;
    }
  };

  return (
    <div className="point-cloud-viewer" aria-label={ariaLabel} aria-describedby={descriptionId}>
      <div className="point-cloud-viewer__toolbar" role="group" aria-label="Measurement tools">
        {(["orbit", "distance", "area", "volume"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className="pcv-btn"
            aria-pressed={mode === m}
            data-active={mode === m}
            onClick={() => selectMode(m)}
            disabled={status !== "ready"}
          >
            {m === "orbit" ? "Orbit" : m === "distance" ? "Distance" : m === "area" ? "Area" : "Volume"}
          </button>
        ))}
        {mode !== "orbit" ? (
          <>
            <span className="pcv-sep" aria-hidden="true" />
            {canFinish ? (
              <button type="button" className="pcv-btn" onClick={finishMeasurement}>
                Finish
              </button>
            ) : null}
            <button
              type="button"
              className="pcv-btn"
              onClick={() => {
                setVertices((prev) => prev.slice(0, -1));
                setClosed(false);
              }}
              disabled={vertices.length === 0}
            >
              Undo point
            </button>
            <button
              type="button"
              className="pcv-btn"
              onClick={() => {
                setVertices([]);
                setClosed(false);
              }}
              disabled={vertices.length === 0}
            >
              Clear
            </button>
          </>
        ) : null}
      </div>

      <div
        ref={frameRef}
        tabIndex={0}
        role="application"
        aria-label={`${ariaLabel}. Arrow keys orbit, plus and minus zoom${
          mode === "orbit" ? "" : ", Enter places a point at the center reticle, Backspace removes the last"
        }.`}
        onKeyDown={onFrameKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          position: "relative",
          height,
          width: "100%",
          borderRadius: "8px",
          overflow: "hidden",
          background: "#0b1020",
          cursor: mode === "orbit" ? "grab" : "crosshair",
          outline: focused ? "2px solid #6366f1" : "none",
          outlineOffset: "2px",
        }}
      >
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

        {status === "ready" && focused && mode !== "orbit" ? (
          <div className="pcv-reticle" aria-hidden="true" />
        ) : null}

        {status === "ready" && mode !== "orbit" ? (
          <div className="pcv-readout" role="status">
            <p className="pcv-readout__hint">{MODE_HINT[mode]}</p>
            {distanceResult ? (
              <dl className="pcv-readout__values">
                <div><dt>Distance</dt><dd>{formatMeters(distanceResult.slope)}</dd></div>
                <div><dt>Horizontal</dt><dd>{formatMeters(distanceResult.horizontal)}</dd></div>
                <div><dt>Elevation Δ</dt><dd>{formatMeters(distanceResult.vertical)}</dd></div>
              </dl>
            ) : null}
            {areaResult ? (
              <dl className="pcv-readout__values">
                <div><dt>Plan area</dt><dd>{formatArea(areaResult.area)}</dd></div>
                <div><dt>Perimeter</dt><dd>{formatMeters(areaResult.perimeter)}</dd></div>
              </dl>
            ) : null}
            {volumeResult ? (
              <dl className="pcv-readout__values">
                <div><dt>Net volume</dt><dd>{formatVolume(volumeResult.net)}</dd></div>
                <div><dt>Cut / Fill</dt><dd>{formatVolume(volumeResult.cut)} / {formatVolume(volumeResult.fill)}</dd></div>
                <div><dt>Plan area</dt><dd>{formatArea(volumeResult.area)}</dd></div>
                <div>
                  <dt>Coverage</dt>
                  <dd>
                    {volumeResult.polygonCells > 0
                      ? `${Math.round((volumeResult.filledCells / volumeResult.polygonCells) * 100)}% · ${volumeResult.cellSize.toFixed(2)} m grid`
                      : "—"}
                  </dd>
                </div>
              </dl>
            ) : null}
            {!distanceResult && !areaResult && !volumeResult ? (
              <p className="pcv-readout__pending">
                {vertices.length} point{vertices.length === 1 ? "" : "s"} placed
                {canFinish ? " · press Finish" : ""}
              </p>
            ) : null}
            {lastVertexWorld ? (
              <p className="pcv-readout__coord" title="UTM easting / northing / elevation of the last point">
                {lastVertexWorld.easting.toFixed(1)} E · {lastVertexWorld.northing.toFixed(1)} N ·{" "}
                {lastVertexWorld.elevation.toFixed(2)} m
              </p>
            ) : null}
          </div>
        ) : null}

        {status !== "ready" ? (
          <div
            role="status"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
              textAlign: "center",
              color: status === "error" ? "#fca5a5" : "#cbd5f5",
              fontSize: "0.9rem",
            }}
          >
            {status === "error"
              ? (errorMessage ?? "Could not render the point cloud.")
              : "Decoding point cloud…"}
          </div>
        ) : null}
      </div>

      <div
        className="point-cloud-viewer__controls"
        style={{
          marginTop: "0.5rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <label htmlFor={sizeId} style={{ fontSize: "0.875rem" }}>
          Point size
        </label>
        <input
          id={sizeId}
          type="range"
          min={1}
          max={6}
          step={0.5}
          value={pointSize}
          onChange={(event) => setPointSize(Number(event.target.value))}
          disabled={status !== "ready"}
          aria-valuetext={`${pointSize} pixels`}
          style={{ flex: 1, minWidth: "120px" }}
        />
        <div className="pcv-colormode" role="group" aria-label="Color mode">
          <button
            type="button"
            className="pcv-btn"
            aria-pressed={colorMode === "rgb"}
            data-active={colorMode === "rgb"}
            onClick={() => setColorMode("rgb")}
            disabled={status !== "ready" || !stats?.hasRgb}
            title={stats?.hasRgb ? undefined : "This cloud has no true-color data"}
          >
            True color
          </button>
          <button
            type="button"
            className="pcv-btn"
            aria-pressed={colorMode === "elevation"}
            data-active={colorMode === "elevation"}
            onClick={() => setColorMode("elevation")}
            disabled={status !== "ready"}
          >
            Elevation
          </button>
        </div>
        {stats ? (
          <span className="muted" style={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>
            {formatCount(stats.rendered)}
            {decimated ? ` of ${formatCount(stats.total)}` : ""} points
          </span>
        ) : null}
      </div>
      <p id={descriptionId} className="sr-only">
        Interactive 3D point-cloud preview{label ? ` for ${label}` : ""}. Drag to orbit,
        scroll or pinch to zoom, right-drag to pan. Use the measurement tools to measure distance,
        plan area, and cut/fill volume by clicking points on the cloud. The view is keyboard
        operable: focus it, orbit with the arrow keys, zoom with plus and minus, and in a
        measurement mode press Enter to place a point at the center reticle or Backspace to remove
        the last one.
        {decimated && stats
          ? ` Showing ${formatCount(stats.rendered)} of ${formatCount(stats.total)} points for performance.`
          : ""}
      </p>
    </div>
  );
}

/** Build a per-point elevation-ramp color buffer from local y (up) values. */
function buildElevationColors(positions: Float32Array): Float32Array {
  const count = positions.length / 3;
  const colors = new Float32Array(positions.length);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const y = positions[i * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = maxY - minY || 1;
  for (let i = 0; i < count; i++) {
    const [r, g, b] = elevationColor((positions[i * 3 + 1] - minY) / span);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return colors;
}

/** Dispose every child of a group and remove them, freeing GPU resources. */
function disposeGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    const mesh = child as THREE.Mesh | THREE.Line;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  }
}

export default PointCloudViewer;
