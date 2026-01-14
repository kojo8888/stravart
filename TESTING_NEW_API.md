# Testing the New Graph-Based Routing API

## Quick Start

The new graph-based routing API is ready to test! Here's how:

### 1. Start the Development Server

```bash
npm run dev
```

### 2. Test with the Automated Script

In a new terminal:

```bash
node scripts/test-graph-api.js
```

**What to expect:**
- First request will take ~40 seconds (builds the graph once)
- Subsequent requests will be <10ms
- You'll see results for 3 test shapes (heart, circle, star)

### 3. Manual Testing with cURL

**Health Check:**
```bash
curl http://localhost:3000/api/graph-route | jq
```

**Generate a Heart Route:**
```bash
curl -X POST http://localhost:3000/api/graph-route \
  -H "Content-Type: application/json" \
  -d '{
    "location": {"lat": 48.1351, "lng": 11.5820},
    "shape": "heart",
    "targetDistanceKm": 5.0
  }' | jq
```

### 4. Compare with Old API

**Old API (optimization-based):**
```bash
curl -X POST http://localhost:3000/api/fit-fetch \
  -H "Content-Type: application/json" \
  -d '{
    "location": {"lat": 48.1351, "lng": 11.5820},
    "shape": "heart",
    "targetDistanceKm": 5.0
  }' | jq
```

**New API (graph-based):**
```bash
curl -X POST http://localhost:3000/api/graph-route \
  -H "Content-Type: application/json" \
  -d '{
    "location": {"lat": 48.1351, "lng": 11.5820},
    "shape": "heart",
    "targetDistanceKm": 5.0
  }' | jq
```

## Key Differences in Responses

### Old API Output (Points)
```json
{
  "type": "FeatureCollection",
  "properties": {
    "totalDistanceKm": 5.23,
    "pointCount": 100
  },
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",  // ← Just points
        "coordinates": [11.5820, 48.1351]
      }
    }
  ]
}
```

### New API Output (Routes)
```json
{
  "type": "FeatureCollection",
  "properties": {
    "actualDistanceKm": 5.23,
    "totalNodes": 116,
    "segments": 16,
    "routingTimeMs": 8
  },
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",  // ← Connected routes!
        "coordinates": [
          [11.5820, 48.1351],
          [11.5825, 48.1355],
          [11.5830, 48.1360],
          ...
        ]
      }
    }
  ]
}
```

## Integration with Frontend

To use the new API in your frontend, you can:

### Option 1: Switch Entirely to New API

Update `app/page.tsx` to use `/api/graph-route` instead of `/api/fit-fetch`:

```typescript
// Change this:
const response = await fetch('/api/fit-fetch', { ... })

// To this:
const response = await fetch('/api/graph-route', { ... })
```

### Option 2: Add a Toggle/Switch

Add a UI toggle to let users choose between:
- **Old Method**: Works anywhere, slower, points only
- **New Method**: Munich only, faster, actual routes

### Option 3: Auto-detect Region

```typescript
async function generateRoute(location, shape, distance) {
  // Check if in Oberbayern
  const inOberbayern =
    location.lat >= 47.39 && location.lat <= 49.09 &&
    location.lng >= 10.72 && location.lng <= 13.10

  const endpoint = inOberbayern ? '/api/graph-route' : '/api/fit-fetch'

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location, shape, targetDistanceKm: distance })
  })

  return await response.json()
}
```

## Expected Test Results

When you run `node scripts/test-graph-api.js`, you should see:

```
================================================================
         Testing Graph-Based Routing API
================================================================

🏥 Testing health check endpoint...
✅ Health check response:
{
  "service": "graph-based-routing",
  "status": "not-loaded",
  ...
}

⏱️  Note: First request will take ~40s to build the graph

🧪 Testing: Munich Heart (5km)
   Location: (48.1351, 11.582)
   Shape: heart
   Target: 5km
🔧 [GRAPH-ROUTE] Building graph for the first time...
[... graph building logs ...]
✅ Route generated successfully (42134ms)
   - Features: 16
   - Actual distance: 6.72km
   - Target distance: 5km
   - Waypoints: 16
   - Segments: 16
   - Total nodes: 116
   - Routing time: 8ms
   - Distance accuracy: ±1.72km (34.4%)

🧪 Testing: Munich Circle (3km)
   Location: (48.1351, 11.582)
   Shape: circle
   Target: 3km
✅ Route generated successfully (12ms)  // ← Fast now!
   - Features: 8
   - Actual distance: 2.95km
   - Target distance: 3km
   - Waypoints: 8
   - Segments: 8
   - Total nodes: 48
   - Routing time: 2ms
   - Distance accuracy: ±0.05km (1.7%)

🧪 Testing: Munich Star (10km)
   Location: (48.1351, 11.582)
   Shape: star
   Target: 10km
✅ Route generated successfully (15ms)
   - Features: 20
   - Actual distance: 11.84km
   - Target distance: 10km
   - Waypoints: 20
   - Segments: 20
   - Total nodes: 156
   - Routing time: 4ms
   - Distance accuracy: ±1.84km (18.4%)

================================================================
                     Test Summary
================================================================
Total tests: 3
✅ Passed: 3
❌ Failed: 0

🎉 All tests passed!
```

## Visualizing Results

To visualize the generated routes:

1. Save the GeoJSON response to a file:
```bash
curl -X POST http://localhost:3000/api/graph-route \
  -H "Content-Type: application/json" \
  -d '{"location": {"lat": 48.1351, "lng": 11.5820}, "shape": "heart", "targetDistanceKm": 5.0}' \
  > test-route.geojson
```

2. Open at https://geojson.io
3. Drag and drop `test-route.geojson`

You'll see the actual routed path (connected lines), not just points!

## Troubleshooting

### Error: "Location outside supported region"
- The new API only works in Oberbayern/Munich area
- Coordinates must be within: lat 47.39-49.09, lng 10.72-13.10
- Try Munich center: `{"lat": 48.1351, "lng": 11.5820}`

### First request takes 40+ seconds
- This is expected! The graph is being built for the first time
- Subsequent requests will be <10ms
- The graph stays cached in memory while the server runs

### Import errors or TypeScript errors
- Make sure you've installed all dependencies: `npm install`
- Check that `fixtures/oberbayern-streets.geojson` exists
- If not, run: `npm run build` or manually build it with the scripts

### 500 Internal Server Error
- Check the server logs for details
- Make sure the GeoJSON file exists at `fixtures/oberbayern-streets.geojson`
- Verify Node.js has enough memory (uses ~500MB for graph)

## Next Steps

Once you've verified it works:

1. **Test in your UI**: Try calling the new endpoint from your frontend
2. **Compare quality**: See if the connected routes look better than point-based
3. **Check performance**: Notice the speed difference after first load
4. **Decide on strategy**: Choose how to integrate (replace, toggle, or auto-detect)

## Documentation

- **API Documentation**: `/app/api/graph-route/README.md`
- **Technical Details**: `/GRAPH_ROUTING_SUMMARY.md`
- **Old API**: `/app/api/fit-fetch/route.js` (still available)

---

**Status**: ✅ Ready for testing!

Both APIs are running side-by-side. Test the new one and see if you prefer the results!
