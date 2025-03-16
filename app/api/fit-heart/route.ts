// app/api/fit-heart/route.ts
import { NextResponse } from 'next/server';
import { GeoJsonObject } from 'geojson';

interface Coordinates {
  lat: number;
  lng: number;
}

interface Payload {
  location: Coordinates | null;
  drawing: { x: number; y: number }[];
}

// Dummy optimization function: replace with your actual logic.
function runOptimization(payload: Payload): GeoJsonObject {
  const features = payload.drawing.map((pt) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [pt.x, pt.y],
    },
    properties: {},
  }));
  
  return {
    type: 'FeatureCollection',
    features,
  };
}

export async function POST(request: Request) {
  try {
    const payload: Payload = await request.json();
    console.log('Received payload:', payload);
    const result: GeoJsonObject = runOptimization(payload);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.error();
  }
}
