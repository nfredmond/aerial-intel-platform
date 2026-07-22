"use client";

import { useEffect, useId, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { decodeLaz } from "@/lib/pointcloud/laz";

export type PointCloudViewerProps = {
  signedUrl: string;
  wasmUrl?: string;
  label?: string;
  height?: string;
  ariaLabel?: string;
  maxPoints?: number;
};

type ViewerStats = {
  rendered: number;
  total: number;
  colorMode: "rgb" | "elevation";
};

const DEFAULT_POINT_SIZE = 2;

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
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
  const materialRef = useRef<THREE.PointsMaterial | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<ViewerStats | null>(null);
  const [pointSize, setPointSize] = useState(DEFAULT_POINT_SIZE);
  const descriptionId = useId();
  const sizeId = useId();

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
        const distance = cloud.boundingRadius * 2.2;
        camera.position.set(distance * 0.85, distance * 0.9, distance * 0.85);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(cloud.positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(cloud.colors, 3));
        geometry.computeBoundingSphere();

        const material = new THREE.PointsMaterial({
          size: DEFAULT_POINT_SIZE,
          sizeAttenuation: false,
          vertexColors: true,
        });
        materialRef.current = material;

        points = new THREE.Points(geometry, material);
        scene.add(points);

        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, heightPx);
        renderer.domElement.style.display = "block";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        container.appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.target.set(0, 0, 0);
        controls.update();

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

        setStats({
          rendered: cloud.renderedCount,
          total: cloud.totalCount,
          colorMode: cloud.colorMode,
        });
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
      if (points) {
        points.geometry.dispose();
        (points.material as THREE.Material).dispose();
      }
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
      materialRef.current = null;
    };
  }, [signedUrl, wasmUrl, maxPoints]);

  useEffect(() => {
    if (materialRef.current) materialRef.current.size = pointSize;
  }, [pointSize]);

  const decimated = stats ? stats.rendered < stats.total : false;

  return (
    <div
      className="point-cloud-viewer"
      aria-label={ariaLabel}
      aria-describedby={descriptionId}
    >
      <div
        style={{
          position: "relative",
          height,
          width: "100%",
          borderRadius: "8px",
          overflow: "hidden",
          background: "#0b1020",
        }}
      >
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
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
        {stats ? (
          <span className="muted" style={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>
            {formatCount(stats.rendered)}
            {decimated ? ` of ${formatCount(stats.total)}` : ""} points ·{" "}
            {stats.colorMode === "rgb" ? "true color" : "elevation"}
          </span>
        ) : null}
      </div>
      <p id={descriptionId} className="sr-only">
        Interactive 3D point-cloud preview{label ? ` for ${label}` : ""}. Drag to orbit,
        scroll or pinch to zoom, right-drag to pan.
        {decimated && stats
          ? ` Showing ${formatCount(stats.rendered)} of ${formatCount(stats.total)} points for performance.`
          : ""}
      </p>
    </div>
  );
}

export default PointCloudViewer;
