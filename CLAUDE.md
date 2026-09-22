# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server on localhost:3000
- `npm run build` - Build production version
- `npm run start` - Start production server
- `npm run lint` - Run ESLint linting

## Project Architecture

Strava Art is a Next.js 15 application that generates rideable bike/run routes shaped like drawings (hearts, stars, circles, squares) by routing through real street networks.

### Routing Strategies

**1. Optimized Route API (Primary - Worldwide)**
- Hybrid approach: Nelder-Mead optimization + A* pathfinding
- Fetches OSM data dynamically via Overpass API (no pre-built fixtures needed)
- Works anywhere in the world
- Located in `app/api/optimized-route/route.ts`
- Uses `lib/graph/osm-fetcher.ts` for dynamic data fetching

**2. Curve-Following Router (Legacy - Munich only)**
- Uses direction-aware A* pathfinding with corridor constraints
- Requires pre-built 75MB fixture file
- Located in `lib/graph/curve-router.ts`
- API endpoint: `/api/shape-route`

**3. Optimization-Based Fitting (Points only)**
- Uses Nelder-Mead algorithm to fit shapes to street nodes
- Returns points (not connected routes)
- Located in `app/api/fit-fetch/route.js`

### API Endpoints

| Endpoint | Method | Coverage | Returns |
|----------|--------|----------|---------|
| `/api/optimized-route` | POST | Worldwide | Connected A* routes |
| `/api/shape-route` | POST | Munich only | Connected A* routes |
| `/api/fit-fetch` | POST | Worldwide | Points only |

### Optimized Route Flow (Worldwide)

```
1. User selects location + shape + distance
2. Frontend calls /api/optimized-route
3. Calculate shape bounding box from initial radius
4. Fetch OSM street data for bbox via Overpass API (~2-5s)
5. Build graph in memory (nodes at intersections only)
6. Phase 1: Nelder-Mead optimization finds best position/rotation
7. Phase 2: Generate waypoints on optimized shape
8. Phase 3: Connectivity-aware waypoint snapping to street nodes
9. Phase 4: A* routing between waypoints with corridor constraints
10. Quality assessment - auto-retry with rotation variations if needed
11. Returns GeoJSON with connected LineString segments + quality metrics
```

### Quality Metrics & Auto-Retry

The optimized-route API includes quality assessment with automatic retry:

| Metric | Threshold | Description |
|--------|-----------|-------------|
| `distanceError` | 25% | Actual vs target distance variance |
| `maxDetourRatio` | 6.0x | Worst segment detour vs straight-line |
| `suspiciousSegments` | 2 | Segments with detour > 5x |
| `fallbackPercent` | 30% | Segments needing expanded corridor |

If quality fails, the system retries with rotation offsets: 0°, ±15°, ±30°, ±45° (up to 7 attempts).

### Dynamic OSM Fetching

The `lib/graph/osm-fetcher.ts` module handles worldwide data:

```typescript
// Calculates bbox from shape coordinates + padding
calculateBBox(coords, paddingMeters)

// Fetches from Overpass API, builds graph, caches result
fetchAndBuildGraph(bbox) → { graph, spatialIndex, fromCache }
```

**Caching:**
- In-memory cache with 30-minute TTL
- Cache key based on bbox (rounded to ~100m precision)
- Subsequent requests in same area are instant (0ms)

**Highway types fetched:**
- residential, cycleway, tertiary, unclassified, service
- living_street, pedestrian, track, path, footway
- secondary, primary (for connectivity)

### Supported Shapes

| Shape | Distance Ratio | Min Radius | Typical Error |
|-------|---------------|------------|---------------|
| Heart | 10.5 | 800m | ~15% |
| Star | 15.0 | 600m | ~5% |
| Circle | 19.5 | 400m | ~25% |
| Square | 18.5 | 400m | ~12% |

### Core Components

**Frontend (`app/page.tsx`)**
- Main interface with location selection, shape picker, distance input
- Uses React 19 with TypeScript, Tailwind CSS, Radix UI
- Calls `/api/optimized-route` for worldwide routing
- Displays quality metrics, graph stats, and routing info

**OSM Fetcher (`lib/graph/osm-fetcher.ts`)**
- `calculateBBox()` - Compute bounding box from coordinates with padding
- `fetchAndBuildGraph()` - Fetch OSM data, build graph, cache result
- `clearCache()` / `getCacheStats()` - Cache management

**Graph Builder (`lib/graph/builder.ts`)**
- Converts GeoJSON street data to graphology graph
- Supports both file paths (streaming) and in-memory GeoJSON objects
- 2-pass approach: find intersections, then build edges
- Creates nodes only at intersections for efficiency

**Curve Router (`lib/graph/curve-router.ts`)**
- `findCurveFollowingRoute()` - Direction-aware A* with corridor constraint
- `routeShapeWithCurveFollowing()` - Route through all waypoints
- `segmentsToGeoJSON()` - Convert segments to GeoJSON output

**Spatial Index (`lib/graph/spatial-index.ts`)**
- RBush-based spatial indexing for fast nearest-node queries
- `findNearest()` - Single nearest node
- `findKNearest()` - K nearest nodes (for connectivity-aware snapping)
- Filters to largest connected component

**Shape Library (`lib/shapes/`)**
- `heart.ts`, `circle.ts`, `star.ts`, `square.ts`
- Parametric equations for each shape
- Central registry in `index.ts`

### File Structure

```
stravart/
├── app/
│   ├── api/
│   │   ├── optimized-route/route.ts  # Hybrid router (worldwide, primary)
│   │   ├── shape-route/route.ts      # Curve-following (Munich only)
│   │   ├── fit-fetch/route.js        # Optimization only (points)
│   │   └── stripe/                   # Payment endpoints
│   ├── page.tsx                      # Main UI
│   └── layout.tsx
├── components/
│   ├── GeoMap.tsx                   # Leaflet map
│   ├── DrawingBoard.tsx             # Custom shape drawing
│   └── ui/                          # Radix UI components
├── lib/
│   ├── graph/
│   │   ├── osm-fetcher.ts           # Dynamic OSM data fetching
│   │   ├── curve-router.ts          # Curve-following A* algorithm
│   │   ├── builder.ts               # GeoJSON → Graph (file or object)
│   │   ├── spatial-index.ts         # RBush indexing
│   │   ├── shape-to-waypoints.ts
│   │   ├── router.ts                # Standard A*
│   │   ├── types.ts
│   │   └── utils.ts
│   ├── shapes/                      # Shape generators
│   └── payment.ts
├── fixtures/
│   └── munich-streets.geojson       # Munich street network (legacy, 75MB)
├── docs/
│   └── ROUTING_STRATEGY.md          # Detailed routing documentation
├── scripts/
│   ├── fetch-osm-streets.js         # Fetch OSM data to fixture file
│   ├── test-curve-router.ts         # Test curve-following router
│   └── build-bavaria-graph.ts       # Build graph from GeoJSON
└── test-outputs/                    # Generated test routes
```

### Technology Stack

- **Framework**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS v4, Radix UI
- **Maps**: Leaflet.js, react-leaflet
- **Graph**: graphology, graphology-shortest-path
- **Spatial**: RBush, Turf.js
- **Data**: OpenStreetMap via Overpass API
- **Payment**: Stripe

### Key Parameters

**Optimized Route API:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `waypointCount` | 40 | Points around shape |
| `corridorWidth` | 150-300m | Adaptive based on scale |
| `directionPenalty` | 0.3-0.5 | Penalty for wrong direction |
| `bboxPadding` | 500m+ | Extra area fetched for routing |

### Performance

| Metric | Worldwide (dynamic) | Munich (cached fixture) |
|--------|---------------------|------------------------|
| First request | 3-8s (fetch + build) | ~17s (build from 75MB) |
| Cached request | 0.3-0.5s | 50-100ms |
| Graph size | 1K-20K nodes (varies) | ~88K nodes |
| Memory | ~50-200MB per cache | ~500MB |

### Supported Regions

**Worldwide** via dynamic OSM fetching:
- Any location with OpenStreetMap coverage
- Automatic bbox calculation based on shape size
- In-memory caching for repeated requests in same area

### Environment Variables

```bash
STRIPE_SECRET_KEY="sk_live_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

## Design & Style Guide

### UX Guidelines
1. **Always use Tailwind CSS** - No custom CSS
2. **Always use shadcn/ui components** - Consistent, accessible
3. **Light design** - Clean, minimal, white space
4. **Minimal colors** - Neutral grays + 1-2 accent colors
5. **Mobile-first** - Design for mobile, scale up

## Core Rules

1. **Never push directly to `main`** - Use feature branches
2. **Use environment variables** - Never hardcode secrets
3. **Use Context 7 MCP** for programming documentation
