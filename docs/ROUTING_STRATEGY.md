# Strava Art Routing Strategy

## Overview

Strava Art creates rideable routes that form visual shapes (hearts, stars, circles, squares) when viewed on a map. This document describes the current routing strategy.

## The Challenge

Creating Strava Art requires solving a unique problem:
- **Goal**: Generate a continuous, rideable route that visually resembles a target shape
- **Constraint**: The route must follow real streets from OpenStreetMap
- **Trade-off**: Shape quality vs. exact distance accuracy

## Solution: Curve-Following Router

After testing multiple approaches, the **curve-following router** produces the best results.

### How It Works

```
1. SHAPE GENERATION
   └─> Generate shape points (heart, star, circle, square)
   └─> Scale to target radius based on desired distance

2. WAYPOINT PLACEMENT
   └─> Sample 40 waypoints around the shape perimeter
   └─> Snap waypoints to nearest street nodes

3. CORRIDOR CONSTRAINT
   └─> Define a corridor (20% of radius) around the shape
   └─> Only allow routing through streets within this corridor
   └─> Prevents shortcuts through the middle of the shape

4. DIRECTION-AWARE A*
   └─> Route between consecutive waypoints
   └─> Penalize paths that deviate from the shape's tangent direction
   └─> Forces route to follow the curve instead of cutting across

5. OUTPUT
   └─> 40 connected segments forming a continuous route
   └─> GeoJSON with LineString features for each segment
   └─> GPX export for Strava/GPS devices
```

### Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `corridorWidthRatio` | 0.20 | Corridor width as fraction of radius |
| `directionPenalty` | 0.6 | Penalty for deviating from shape direction (0-1) |
| `waypointCount` | 40 | Number of waypoints around shape |

### Distance Calibration

Each shape has a calibrated ratio of `route distance / radius`:

| Shape | Ratio | Min Radius | Notes |
|-------|-------|------------|-------|
| Heart | 10.5 | 800m | Tight curves need larger radius |
| Star | 15.0 | 600m | Sharp points add distance |
| Circle | 19.5 | 400m | Smooth curves, higher variance |
| Square | 18.5 | 400m | Aligns with street grid |

### Example: 30km Heart Route

```
Target Distance: 30km
Calculated Radius: 30 / 10.5 = 2857m
Corridor Width: 2857 * 0.20 = 571m
Direction Penalty: 0.6

Result:
- 40 segments, all connected
- ~438 street nodes
- Actual distance: ~26km (14% variance)
- Shape: Recognizable heart
```

## API Endpoint

### POST `/api/shape-route`

```json
{
  "location": { "lat": 48.1351, "lng": 11.5820 },
  "shape": "heart",
  "targetDistanceKm": 30
}
```

**Response:**
```json
{
  "type": "FeatureCollection",
  "properties": {
    "method": "curve-following",
    "shape": "heart",
    "targetDistanceKm": 30,
    "actualDistanceKm": 25.7,
    "distanceError": "14.3%",
    "segmentCount": 40,
    "nodeCount": 438,
    "radiusMeters": 2857,
    "corridorWidth": 571
  },
  "features": [
    { "type": "Feature", "geometry": { "type": "LineString", ... } },
    ...
  ]
}
```

## Supported Regions

Currently only **Munich, Germany** (20km radius from city center) is supported due to pre-built street network data.

**Bounds:**
- Lat: 47.9549 to 48.3153
- Lng: 11.3120 to 11.8520

## File Structure

```
lib/graph/
├── curve-router.ts      # Curve-following A* algorithm
├── builder.ts           # GeoJSON → Graph conversion
├── spatial-index.ts     # RBush spatial indexing
├── shape-to-waypoints.ts # Shape → Waypoints conversion
├── router.ts            # Standard A* (not used for shapes)
├── waypoint-router.ts   # Connect waypoints (legacy)
├── types.ts             # Type definitions
└── utils.ts             # Helper functions

app/api/
├── shape-route/         # Curve-following router (recommended)
├── fit-fetch/           # Optimization-based fitting (fallback)
└── graph-route/         # Standard graph routing (not for shapes)

fixtures/
└── munich-streets.geojson  # Munich street network (75MB)
```

## Why Not Standard A* Routing?

Standard A* routing **doesn't work for artistic shapes** because:

1. **Shortest path optimization** - A* finds the shortest route between waypoints, which often cuts through the middle of the shape
2. **No shape awareness** - The algorithm doesn't know it should follow a curve
3. **Result** - Unrecognizable mess instead of a heart/star

The curve-following router solves this by:
1. **Corridor constraint** - Limits routing to streets near the shape outline
2. **Direction penalty** - Penalizes paths that deviate from the expected direction

## Performance

| Metric | Value |
|--------|-------|
| Graph build time | ~17s (first request, then cached) |
| Routing time | 50-100ms |
| Segment success rate | 95-100% |
| Memory usage | ~500MB for Munich graph |

## Future Improvements

1. **More regions** - Add street data for other cities
2. **Custom shapes** - Support SVG/drawing input
3. **Iterative distance refinement** - Multiple passes to hit exact target
4. **Route smoothing** - Reduce unnecessary zigzags
5. **Elevation awareness** - Prefer flat routes for cycling
