type RiskLevel = "low" | "moderate" | "elevated";

type Position = [number, number];

type PolygonGeometry = {
  type: "Polygon";
  coordinates: Position[][];
};

type MultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: Position[][][];
};

type SupportedGeometry = PolygonGeometry | MultiPolygonGeometry;

type MissionGeometryInput = {
  geometry: unknown;
  fallbackAreaAcres: number;
  missionType: string;
};

type DatasetCoverageInput = {
  geometry: unknown;
  status: string;
};

type TerrainInput = {
  areaAcres: number;
  gsdCm: number;
  missionType: string;
  warnings: string[];
};

export type GeometryInsight = {
  hasGeometry: boolean;
  areaAcres: number | null;
  bboxLabel: string;
  shapeClass: "compact" | "elongated" | "unknown";
  summary: string;
  recommendations: string[];
};

export type TerrainInsight = {
  score: number;
  riskLevel: RiskLevel;
  summary: string;
  recommendations: string[];
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toRiskLevel(score: number): RiskLevel {
  if (score >= 80) return "low";
  if (score >= 60) return "moderate";
  return "elevated";
}

function isPosition(value: unknown): value is Position {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === "number"
    && typeof value[1] === "number"
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
}

function asSupportedGeometry(value: unknown): SupportedGeometry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as { type?: unknown; coordinates?: unknown };
  if (candidate.type === "Polygon" && Array.isArray(candidate.coordinates)) {
    const coordinates = candidate.coordinates as unknown[];
    if (coordinates.every((ring) => Array.isArray(ring) && ring.every(isPosition))) {
      return {
        type: "Polygon",
        coordinates: coordinates as Position[][],
      };
    }
  }

  if (candidate.type === "MultiPolygon" && Array.isArray(candidate.coordinates)) {
    const coordinates = candidate.coordinates as unknown[];
    if (
      coordinates.every(
        (polygon) => Array.isArray(polygon)
          && polygon.every((ring) => Array.isArray(ring) && ring.every(isPosition)),
      )
    ) {
      return {
        type: "MultiPolygon",
        coordinates: coordinates as Position[][][],
      };
    }
  }

  return null;
}

function getRings(geometry: SupportedGeometry) {
  return geometry.type === "Polygon"
    ? geometry.coordinates
    : geometry.coordinates.flat();
}

function getAllPositions(geometry: SupportedGeometry) {
  return getRings(geometry).flat();
}

function getMeanLatitude(positions: Position[]) {
  if (positions.length === 0) return 0;
  const sum = positions.reduce((acc, [, lat]) => acc + lat, 0);
  return sum / positions.length;
}

function projectToMeters(position: Position, meanLatitude: number) {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = Math.cos((meanLatitude * Math.PI) / 180) * 111_320;

  return {
    x: position[0] * metersPerDegreeLon,
    y: position[1] * metersPerDegreeLat,
  };
}

function getRingAreaSquareMeters(ring: Position[], meanLatitude: number) {
  if (ring.length < 4) return 0;

  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = projectToMeters(ring[index], meanLatitude);
    const next = projectToMeters(ring[index + 1], meanLatitude);
    sum += current.x * next.y - next.x * current.y;
  }

  return Math.abs(sum) / 2;
}

function squareMetersToAcres(squareMeters: number) {
  return squareMeters * 0.000247105;
}

function getGeometryMetrics(geometry: SupportedGeometry) {
  const positions = getAllPositions(geometry);
  if (positions.length === 0) {
    return null;
  }

  const meanLatitude = getMeanLatitude(positions);
  const longitudes = positions.map(([lon]) => lon);
  const latitudes = positions.map(([, lat]) => lat);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);

  const minProjected = projectToMeters([minLon, minLat], meanLatitude);
  const maxProjected = projectToMeters([maxLon, maxLat], meanLatitude);
  const widthMeters = Math.abs(maxProjected.x - minProjected.x);
  const heightMeters = Math.abs(maxProjected.y - minProjected.y);
  const aspectRatio = widthMeters > 0 && heightMeters > 0
    ? Math.max(widthMeters, heightMeters) / Math.max(1, Math.min(widthMeters, heightMeters))
    : 1;

  const rings = getRings(geometry);
  const areaSquareMeters = rings.reduce((acc, ring, index) => {
    const ringArea = getRingAreaSquareMeters(ring, meanLatitude);
    return index === 0 ? acc + ringArea : acc - ringArea;
  }, 0);

  return {
    areaAcres: squareMetersToAcres(Math.max(0, areaSquareMeters)),
    bboxLabel: `${widthMeters.toFixed(0)} m × ${heightMeters.toFixed(0)} m`,
    shapeClass: aspectRatio >= 3 ? "elongated" : "compact",
  } as const;
}

export function getMissionGeometryInsight(input: MissionGeometryInput): GeometryInsight {
  const geometry = asSupportedGeometry(input.geometry);
  const recommendations: string[] = [];

  if (!geometry) {
    const fallbackArea = Number.isFinite(input.fallbackAreaAcres) ? input.fallbackAreaAcres : 0;
    recommendations.push("Attach actual planning geometry to unlock coverage extent, footprint dimensions, and shape-aware QA.");
    recommendations.push("Until geometry is attached, area-based mission reasoning remains approximate rather than map-derived.");

    if (fallbackArea > 40) {
      recommendations.push("Large mapped area suggests splitting flights and QA into smaller operational blocks.");
    }

    return {
      hasGeometry: false,
      areaAcres: fallbackArea > 0 ? fallbackArea : null,
      bboxLabel: "Geometry unavailable",
      shapeClass: "unknown",
      summary: "Mission geometry is not attached yet, so the app can only offer area-based estimates rather than true spatial coverage analytics.",
      recommendations,
    };
  }

  const metrics = getGeometryMetrics(geometry);
  if (!metrics) {
    return {
      hasGeometry: false,
      areaAcres: null,
      bboxLabel: "Geometry unreadable",
      shapeClass: "unknown",
      summary: "Mission geometry exists but could not be interpreted for map metrics.",
      recommendations: ["Verify the planning geometry is valid GeoJSON Polygon or MultiPolygon content."],
    };
  }

  if (metrics.shapeClass === "elongated") {
    if (input.missionType.toLowerCase().includes("corridor")) {
      recommendations.push("Geometry reads as corridor-like, which supports segmented battery planning and route-based QA.");
    } else {
      recommendations.push("AOI is elongated enough that corridor-mode planning may be more efficient than a single compact grid assumption.");
    }
  } else {
    recommendations.push("AOI reads as relatively compact, which is favorable for block capture and simpler seam management.");
  }

  if (metrics.areaAcres > 40) {
    recommendations.push("Large mapped footprint: expect longer QA cycles and consider sub-area checkpoints for delivery confidence.");
  }

  return {
    hasGeometry: true,
    areaAcres: Number(metrics.areaAcres.toFixed(1)),
    bboxLabel: metrics.bboxLabel,
    shapeClass: metrics.shapeClass,
    summary: "Mission geometry is attached, so the app can now reason about actual footprint shape and approximate extent instead of summary-only estimates.",
    recommendations,
  };
}

export function getDatasetCoverageInsight(input: DatasetCoverageInput): GeometryInsight {
  const geometry = asSupportedGeometry(input.geometry);
  const recommendations: string[] = [];

  if (!geometry) {
    recommendations.push("Attach a real spatial footprint to compare capture coverage against the mission AOI.");
    if (input.status === "preflight_flagged") {
      recommendations.push("Because the dataset is already flagged, missing footprint geometry makes coverage QA even less certain.");
    }

    return {
      hasGeometry: false,
      areaAcres: null,
      bboxLabel: "Footprint unavailable",
      shapeClass: "unknown",
      summary: "Dataset footprint geometry is not attached yet, so coverage review is still relying on metadata and operator notes.",
      recommendations,
    };
  }

  const metrics = getGeometryMetrics(geometry);
  if (!metrics) {
    return {
      hasGeometry: false,
      areaAcres: null,
      bboxLabel: "Footprint unreadable",
      shapeClass: "unknown",
      summary: "Dataset footprint exists but could not be interpreted for coverage metrics.",
      recommendations: ["Verify the dataset footprint is valid GeoJSON Polygon or MultiPolygon content."],
    };
  }

  if (metrics.shapeClass === "elongated") {
    recommendations.push("Coverage footprint is elongated, so inspect corridor continuity and end-cap completeness carefully.");
  } else {
    recommendations.push("Coverage footprint is relatively compact, which is helpful for seam consistency and footprint closure.");
  }

  return {
    hasGeometry: true,
    areaAcres: Number(metrics.areaAcres.toFixed(1)),
    bboxLabel: metrics.bboxLabel,
    shapeClass: metrics.shapeClass,
    summary: "Dataset footprint geometry is attached, so coverage QA can start using actual spatial extent instead of only metadata hints.",
    recommendations,
  };
}

export function getTerrainInsight(input: TerrainInput): TerrainInsight {
  const recommendations: string[] = [];
  let score = 74;

  if (input.areaAcres > 40) {
    score -= 8;
    recommendations.push("Large terrain extent means elevation shifts can accumulate across the mission; confirm segmentation and terrain-following assumptions.");
  }

  if (input.gsdCm > 0 && input.gsdCm <= 2) {
    score -= 3;
    recommendations.push("Fine GSD target increases sensitivity to terrain-induced height variation and motion blur.");
  }

  if (input.missionType.toLowerCase().includes("corridor")) {
    recommendations.push("Corridor flights often magnify terrain-following drift, especially where grade changes are persistent along the route.");
    score -= 4;
  }

  const terrainWarnings = input.warnings.filter((warning) => /terrain|slope|grade|elevation/i.test(warning));
  if (terrainWarnings.length > 0) {
    score -= Math.min(18, terrainWarnings.length * 8);
    recommendations.push("Existing terrain-related warnings mean the mission should keep explicit topographic QA in the loop before delivery or re-use.");
  }

  const finalScore = clampScore(score);
  const riskLevel = toRiskLevel(finalScore);
  const summary =
    riskLevel === "low"
      ? "Terrain posture looks manageable from the current signals, though normal topographic QA still applies."
      : riskLevel === "moderate"
        ? "Terrain posture is workable, but slope/grade assumptions should remain visible in QA and field planning."
        : "Terrain posture is a meaningful risk factor right now; treat terrain-following and elevation assumptions as active review items.";

  return {
    score: finalScore,
    riskLevel,
    summary,
    recommendations,
  };
}
