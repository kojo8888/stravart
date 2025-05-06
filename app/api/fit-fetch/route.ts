import { NextResponse } from 'next/server';
import { FeatureCollection } from 'geojson';

interface Coordinates {
  lat: number;
  lng: number;
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

// ---------- POST HANDLER ----------
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const location = body.location as Coordinates | null;
    const radius = typeof body.radius === "number" ? body.radius : 1500;

    if (!location) {
      console.error("[BACKEND] No location provided in payload.");
      return NextResponse.json({ error: "Location is required." }, { status: 400 });
    }

    const nodes = await fetchStreetNodes(location, radius);

    return NextResponse.json(nodes);
  } catch (err: any) {
    console.error("[BACKEND] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
