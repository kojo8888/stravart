# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server on localhost:3000
- `npm run build` - Build production version
- `npm run start` - Start production server
- `npm run lint` - Run ESLint linting

## Project Architecture

Strava Art is a Next.js 15 application that generates rideable bike/run routes shaped like drawings (hearts, stars, circles, squares) by routing through real street networks.

### Current Routing Strategy

**Curve-Following Router (Primary - Munich)**
- Uses direction-aware A* pathfinding with corridor constraints
- Creates continuous, rideable routes that follow shape outlines
- Located in `lib/graph/curve-router.ts`
- API endpoint: `/api/shape-route`
- See `/docs/ROUTING_STRATEGY.md` for detailed documentation

**Optimization-Based Fitting (Fallback - Worldwide)**
- Uses Nelder-Mead algorithm to fit shapes to street nodes
- Returns points (not connected routes)
- Located in `app/api/fit-fetch/route.js`

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/shape-route` | POST | Curve-following router for Munich (recommended) |
| `/api/fit-fetch` | POST | Optimization-based fitting (fallback) |

### Routing Flow (Munich)

```
1. User selects location + shape + distance
2. Frontend calls /api/shape-route
3. Shape points generated (heart, star, circle, square)
4. Radius calculated from target distance
5. Corridor defined (20% of radius)
6. 40 waypoints placed around shape
7. Curve-following A* routes between waypoints
8. Direction penalty prevents shortcuts
9. Returns GeoJSON with 40 connected LineString segments
10. GPX export available for Strava/GPS devices
```

### Supported Shapes

| Shape | Distance Ratio | Min Radius | Accuracy |
|-------|---------------|------------|----------|
| Heart | 10.5 | 800m | ~15% error |
| Star | 15.0 | 600m | ~5% error |
| Circle | 19.5 | 400m | ~25% error |
| Square | 18.5 | 400m | ~12% error |

### Core Components

**Frontend (`app/page.tsx`)**
- Main interface with location selection, shape picker, distance input
- Uses React 19 with TypeScript, Tailwind CSS, Radix UI
- Automatically uses curve-following router for Munich locations
- Displays route with "Rideable Route" badge and segment/node counts

**Curve Router (`lib/graph/curve-router.ts`)**
- `findCurveFollowingRoute()` - Direction-aware A* with corridor constraint
- `routeShapeWithCurveFollowing()` - Route through all waypoints
- `findNodesInCorridor()` - Filter graph to corridor around shape
- `calculateTangentDirection()` - Get expected direction at each point

**Graph Builder (`lib/graph/builder.ts`)**
- Converts GeoJSON street data to graphology graph
- 2-pass streaming approach for large files
- Creates nodes only at intersections
- ~88K nodes, ~94K edges for Munich

**Spatial Index (`lib/graph/spatial-index.ts`)**
- RBush-based spatial indexing for fast nearest-node queries
- Filters to largest connected component
- O(log n) lookups

**Shape Library (`lib/shapes/`)**
- `heart.ts`, `circle.ts`, `star.ts`, `square.ts`
- Parametric equations for each shape
- Central registry in `index.ts`

### File Structure

```
stravart/
├── app/
│   ├── api/
│   │   ├── shape-route/route.ts  # Curve-following router (Munich)
│   │   ├── fit-fetch/route.js    # Optimization fallback (worldwide)
│   │   └── stripe/               # Payment endpoints
│   ├── page.tsx                  # Main UI
│   └── layout.tsx
├── components/
│   ├── GeoMap.tsx               # Leaflet map
│   ├── DrawingBoard.tsx         # Custom shape drawing
│   └── ui/                      # Radix UI components
├── lib/
│   ├── graph/
│   │   ├── curve-router.ts      # Curve-following A* algorithm
│   │   ├── builder.ts           # GeoJSON → Graph
│   │   ├── spatial-index.ts     # RBush indexing
│   │   ├── shape-to-waypoints.ts
│   │   ├── router.ts            # Standard A* (not for shapes)
│   │   ├── types.ts
│   │   └── utils.ts
│   ├── shapes/                  # Shape generators
│   └── payment.ts
├── fixtures/
│   └── munich-streets.geojson   # Munich street network (75MB)
├── docs/
│   └── ROUTING_STRATEGY.md      # Detailed routing documentation
├── scripts/
│   ├── test-curve-router.ts     # Test curve-following router
│   └── build-bavaria-graph.ts   # Build graph from GeoJSON
└── test-outputs/                # Generated test routes
```

### Technology Stack

- **Framework**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS v4, Radix UI
- **Maps**: Leaflet.js, react-leaflet
- **Graph**: graphology, graphology-shortest-path
- **Spatial**: RBush, Turf.js
- **Payment**: Stripe

### Key Parameters (Curve Router)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `corridorWidthRatio` | 0.20 | Corridor as fraction of radius |
| `directionPenalty` | 0.6 | Penalty for wrong direction (0-1) |
| `waypointCount` | 40 | Points around shape |

### Performance

| Metric | Value |
|--------|-------|
| Graph build | ~17s (first request, cached) |
| Routing | 50-100ms |
| Success rate | 95-100% segments |
| Memory | ~500MB |

### Supported Regions

Currently only **Munich, Germany** (20km radius):
- Lat: 47.9549 to 48.3153
- Lng: 11.3120 to 11.8520

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
