// app/api/fit-heart/route.ts
import { NextResponse } from 'next/server';
import { FeatureCollection } from 'geojson';
import { readFileSync } from 'fs';
import path from 'path';
import fmin from 'fmin';

interface Coordinates {
  lat: number;
  lng: number;
}

interface Payload {
  location: Coordinates | null;
  drawing: { x: number; y: number }[];
}

/**
 * Generate the heart shape as an array of [x, y] points.
 */
function generateHeart(numPoints: number = 200): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < numPoints; i++) {
    const t = (2 * Math.PI * i) / numPoints;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    result.push([x, y]);
  }
  return result;
}

/**
 * Apply scaling, rotation, and translation to the heart shape.
 */
function transformHeart(heart: number[][], params: number[]): number[][] {
  const [scale, theta, tx, ty] = params;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  return heart.map(([x, y]) => [
    scale * (x * cosTheta - y * sinTheta) + tx,
    scale * (x * sinTheta + y * cosTheta) + ty,
  ]);
}

/**
 * Compute squared Euclidean distance between two points.
 */
function squaredDistance(a: number[], b: number[]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/**
 * Cost function: for each transformed heart point, find the closest node and sum the squared distances.
 */
function costFunction(params: number[], heart: number[][], coords: number[][]): number {
  const transformed = transformHeart(heart, params);
  let total = 0;
  for (const point of transformed) {
    let minDist = Infinity;
    for (const node of coords) {
      const d = squaredDistance(point, node);
      if (d < minDist) {
        minDist = d;
      }
    }
    total += minDist;
  }
  return total;
}

/**
 * Load network nodes from a GeoJSON file and run optimization.
 * This mimics your Python run_optimization.
 */
function runOptimization(): FeatureCollection {
  // Adjust the path to your GeoJSON file. Here we assume it's in the public folder.
  const filePath = path.join(process.cwd(), 'public', 'bavaria_bike_nodes.geojson');
  const fileData = readFileSync(filePath, 'utf-8');
  const nodesGeoJSON = JSON.parse(fileData);
  
  // Extract coordinates from each feature (assuming Point geometries)
  const coords: number[][] = nodesGeoJSON.features.map((f: any) => f.geometry.coordinates);
  
  const heart = generateHeart(200);
  const initialParams = [0.10, 0.01, 2.5, 2.5];
  
  // Use fmin to minimize the cost function.
  const result = fmin((params: number[]) => costFunction(params, heart, coords), initialParams);
  const bestParams = result.x;
  const fittedHeart = transformHeart(heart, bestParams);
  
  // Create GeoJSON features from the fitted heart.
  const features = fittedHeart.map(pt => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: pt,
    },
    properties: {},
  }));
  
  const featureCollection: FeatureCollection = {
    type: "FeatureCollection",
    features,
  };
  
  return featureCollection;
}

export async function POST(request: Request) {
  try {
    const payload: Payload = await request.json();
    console.log("Received payload:", payload);
    
    // Here you could use payload data if needed.
    const result = runOptimization();
    
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.error();
  }
}
