export const runtime = "nodejs";


import { NextResponse } from 'next/server';
import type { Feature, FeatureCollection, Point } from "geojson";

// ---- fmin import workaround for CommonJS/ESM ----
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fmin = require('fmin');


interface Coordinates {
  lat: number;
  lng: number;
}

interface Payload {
  location: Coordinates | null;
  shape: string;
  radius?: number;
}

interface FminResult {
  x: number[];
  f: number;
}

// ---------- SHAPE GENERATOR ----------
function generateHeart(numPoints: number = 200): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < numPoints; i++) {
    const t = (2 * Math.PI * i) / numPoints;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);
    result.push([x, y]);
  }
  return result;
}

// ---------- TRANSFORM & COST ----------
function transformShape(shape: number[][], params: number[]): number[][] {
  const [scale, theta, tx, ty] = params;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  return shape.map(([x, y]) => [
    scale * (x * cosTheta - y * sinTheta) + tx,
    scale * (x * sinTheta + y * cosTheta) + ty,
  ]);
}

function costFunction(
  params: number[],
  shape: number[][],
  coords: number[][]
): number {
  const transformed = transformShape(shape, params);
  let total = 0;
  for (const point of transformed) {
    let minDist = Infinity;
    for (const node of coords) {
      const dx = point[0] - node[0];
      const dy = point[1] - node[1];
      const dist = dx * dx + dy * dy;
      if (dist < minDist) minDist = dist;
    }
    total += minDist;
  }
  return total;
}

// ---------- FETCH STREET NODES ----------
async function fetchStreetNodes(location: Coordinates, radius: number): Promise<number[][]> {
  const overpassQuery = `
    [out:json][timeout:25];
    (
      way["highway"](around:${radius},${location.lat},${location.lng});
    );
    out geom;
  `;
  const overpassUrl = "https://overpass-api.de/api/interpreter";

  console.log("[BACKEND] Fetching street nodes from Overpass API...");

  const response = await fetch(overpassUrl, {
    method: "POST",
    body: overpassQuery
  });

  if (!response.ok) {
    console.error("[BACKEND] Overpass API fetch failed:", response.statusText);
    throw new Error("Failed to fetch street data from Overpass API.");
  }

  const data = await response.json();

  const coords: number[][] = [];
  for (const way of data.elements) {
    if (way.type === "way" && way.geometry) {
      for (const node of way.geometry) {
        coords.push([node.lon, node.lat]);
      }
    }
  }

  console.log(`[BACKEND] Fetched ${coords.length} street nodes from Overpass.`);

  if (coords.length === 0) {
    throw new Error("No street nodes found in the selected area.");
  }

  return coords;
}

// ---------- MAIN OPTIMIZATION ----------
async function runOptimization(
  shapeType: string,
  location: Coordinates,
  coords: number[][]
): Promise<FeatureCollection> {

  let shape: number[][];

  if (shapeType.toLowerCase() === 'heart') {
    console.log("[BACKEND] Using built-in heart shape.");
    shape = generateHeart(200);
  } else {
    throw new Error(`Shape type "${shapeType}" not supported.`);
  }

  console.log(`[BACKEND] Starting optimization with ${shape.length} shape points and ${coords.length} street nodes.`);

  const centerX = location.lng;
  const centerY = location.lat;
  const initialParams = [0.01, 0, centerX, centerY];

  const result: FminResult = fmin(
    (params: number[]) => costFunction(params, shape, coords),
    initialParams
  );

  const fitted = transformShape(shape, result.x);

  console.log("[BACKEND] Optimization complete. Returning GeoJSON.");

  const features: Feature<Point>[] = fitted.map((pt) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: pt,
    },
    properties: {},
  }));

  return {
    type: "FeatureCollection",
    features,
  };
}

// ---------- API HANDLER ----------
export async function POST(request: Request) {
  try {
    const payload: Payload = await request.json();
    console.log("[BACKEND] Payload received:", payload);

    const location = payload.location;
    const shape = (payload.shape || "").trim();
    const radius = typeof payload.radius === "number" ? payload.radius : 1500;

    if (!location) {
      console.error("[BACKEND] No location provided in payload.");
      return NextResponse.json({ error: "Location is required." }, { status: 400 });
    }

    const nodes = await fetchStreetNodes(location, radius);

    if (!shape) {
      // No shape requested — just return nodes as GeoJSON points
      console.log("[BACKEND] No shape provided. Returning raw nodes as GeoJSON.");
      const features: Feature<Point>[] = nodes.map(([lon, lat]) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lon, lat],
        },
        properties: {},
      }));

      const featureCollection: FeatureCollection = {
        type: "FeatureCollection",
        features,
      };

      return NextResponse.json(featureCollection);
    } else {
      // Shape provided — run optimization and return fitted shape as GeoJSON
      const result = await runOptimization(shape, location, nodes);
      return NextResponse.json(result);
    }

  } catch (err: unknown) {
    let errorMessage = "Unknown error";
    if (err instanceof Error) {
      errorMessage = err.message;
    }

    console.error("[BACKEND] Unexpected error:", err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
