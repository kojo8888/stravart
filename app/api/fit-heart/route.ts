import { NextResponse } from 'next/server';
import { FeatureCollection } from 'geojson';
import { readFileSync } from 'fs';
import path from 'path';
import * as fmin from 'fmin'; // Optimization library

// Interfaces
interface Coordinates {
  lat: number;
  lng: number;
}

interface Payload {
  location: Coordinates | null;
  shape: string;
}

interface FminResult {
  x: number[];
  f: number;
}

// Generate heart shape (normalized)
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

// Apply scale, rotation, translation
function transformShape(shape: number[][], params: number[]): number[][] {
  const [scale, theta, tx, ty] = params;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  return shape.map(([x, y]) => [
    scale * (x * cosTheta - y * sinTheta) + tx,
    scale * (x * sinTheta + y * cosTheta) + ty,
  ]);
}

// Cost function for optimization
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

// Main logic
function runOptimization(shapeType: string, location: Coordinates | null): FeatureCollection {
  // 1. Load the GeoJSON node network (adjust logic per city if needed)
  const filePath = path.join(process.cwd(), 'public', 'bavaria_bike_nodes.geojson');
  const fileData = readFileSync(filePath, 'utf-8');
  const nodesGeoJSON = JSON.parse(fileData);
  const coords: number[][] = nodesGeoJSON.features.map((f: any) => f.geometry.coordinates);

  // 2. Generate the shape
  let shape: number[][];
  if (shapeType === 'heart') {
    shape = generateHeart(200);
  } else {
    throw new Error(`Shape "${shapeType}" is not supported`);
  }

  // 3. Set initial params: scale, rotation (radians), translate x/y (center of map)
  const centerX = location?.lng || 11.582; // Default Munich
  const centerY = location?.lat || 48.1351;

  const initialParams = [0.01, 0, centerX, centerY];

  // 4. Optimize shape to match nearby nodes
  const result: FminResult = fmin(
    (params: number[]) => costFunction(params, shape, coords),
    initialParams
  );

  const fitted = transformShape(shape, result.x);

  // 5. Build GeoJSON FeatureCollection
  const features = fitted.map((pt) => ({
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

// API Handler
export async function POST(request: Request) {
  try {
    const payload: Payload = await request.json();
    console.log("Payload received:", payload);

    const result = runOptimization(payload.shape, payload.location);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error generating shape:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
