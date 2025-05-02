import { NextResponse } from 'next/server';
import { FeatureCollection } from 'geojson';
import * as fmin from 'fmin'; // Optimization library

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

// ---------- SHAPE GENERATORS ----------

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

function generateCircle(numPoints: number = 200): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < numPoints; i++) {
    const theta = (2 * Math.PI * i) / numPoints;
    const x = Math.cos(theta) * 10;
    const y = Math.sin(theta) * 10;
    result.push([x, y]);
  }
  return result;
}

function generateSquare(): number[][] {
  return [
    [-10, -10],
    [-10, 10],
    [10, 10],
    [10, -10],
    [-10, -10], // Close the square
  ];
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

async function fetchStreetNodes(location: Coordinates): Promise<number[][]> {
  const overpassQuery = `
    [out:json][timeout:25];
    (
      way["highway"](around:1500,${location.lat},${location.lng});
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

// ---------- GPT SHAPE FETCH ----------

async function fetchShapeFromGPT(shapeName: string): Promise<number[][]> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY not set in environment variables.");
  }

  console.log(`[BACKEND] Requesting shape "${shapeName}" from GPT...`);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a geometry assistant. Given a shape name, return 100 outline coordinates (x,y) as a JSON array."
        },
        {
          role: "user",
          content: `Shape: ${shapeName}. Please return the outline as a JSON array of [x, y] pairs.`
        }
      ],
      temperature: 0
    })
  });

  const result = await response.json();

  const text = result.choices[0].message.content;

  const match = text.match(/\[\s*\[.*?\]\s*\]/s);
  if (!match) {
    console.error("[BACKEND] GPT response parsing failed.");
    throw new Error("Failed to parse GPT shape response.");
  }

  const coords: number[][] = JSON.parse(match[0]);

  console.log(`[BACKEND] GPT returned ${coords.length} coordinates for "${shapeName}".`);

  return coords;
}

// ---------- MAIN OPTIMIZATION ----------

async function runOptimization(
  shapeType: string,
  location: Coordinates | null
): Promise<FeatureCollection> {
  if (!location) {
    throw new Error("Location is required.");
  }

  console.log("[BACKEND] Starting optimization for shape:", shapeType);
  console.log("[BACKEND] Location:", location);

  const coords = await fetchStreetNodes(location);

  let shape: number[][];

  if (shapeType.toLowerCase() === 'heart') {
    console.log("[BACKEND] Using built-in heart shape.");
    shape = generateHeart(200);
  } else if (shapeType.toLowerCase() === 'circle') {
    console.log("[BACKEND] Using built-in circle shape.");
    shape = generateCircle(200);
  } else if (shapeType.toLowerCase() === 'square') {
    console.log("[BACKEND] Using built-in square shape.");
    shape = generateSquare();
  } else {
    shape = await fetchShapeFromGPT(shapeType);
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

// ---------- API HANDLER ----------

export async function POST(request: Request) {
  try {
    const payload: Payload = await request.json();
    console.log("[BACKEND] Payload received:", payload);

    const result = await runOptimization(payload.shape, payload.location);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[BACKEND] Error generating shape:", error);
    return new NextResponse(`Internal Server Error: ${error}`, { status: 500 });
  }
}
