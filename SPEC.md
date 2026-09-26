# Stravart - Application Specification

> **Version:** 0.1.0
> **Last Updated:** 2026-09-24
> **Status:** Active Development (Graph-based-Routing branch)

---

## 1. Objective

### 1.1 Purpose

Stravart generates rideable bike and run routes shaped like drawings (hearts, stars, custom shapes) using real street networks. Unlike simple drawing tools, it creates routes that athletes can actually ride by fitting shapes to OpenStreetMap street data and connecting waypoints via smart pathfinding.

### 1.2 Target Users

**Primary:** Strava athletes who want creative, shareable GPS art routes.

**User Characteristics:**
- Cyclists and runners who use GPS devices or Strava
- Creative users wanting unique "GPS art" for social sharing
- Users worldwide (any location with OSM coverage)
- Non-technical users expecting simple UX

### 1.3 Core Value Proposition

- **Worldwide coverage**: Works anywhere via dynamic OSM data fetching
- **Actually rideable**: Routes follow real streets, not just drawings
- **Quality assured**: Auto-retry with rotation variations if route quality fails
- **Fast iteration**: Cached requests complete in <0.5s

### 1.4 Success Criteria

A route is "good" when:
- Distance error < 25% of target
- No segment detours > 6x the straight-line distance
- < 30% of segments require fallback routing
- Shape is recognizable when viewed on a map

---

## 2. Commands

### 2.1 Development

```bash
# Install dependencies
npm install

# Run development server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

### 2.2 Scripts

```bash
# Fetch OSM data to fixture file (legacy)
node scripts/fetch-osm-streets.js

# Test curve-following router
npx tsx scripts/test-curve-router.ts

# Build graph from GeoJSON
npx tsx scripts/build-bavaria-graph.ts
```

### 2.3 Environment Variables

```env
# Required for payments
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 3. Project Structure

```
stravart/
├── app/
│   ├── api/
│   │   ├── optimized-route/route.ts  # Primary API (worldwide)
│   │   ├── shape-route/route.ts      # Legacy (Munich only)
│   │   ├── fit-fetch/route.js        # Points only
│   │   └── stripe/                   # Payment endpoints
│   ├── page.tsx                      # Main UI
│   └── layout.tsx
├── components/
│   ├── GeoMap.tsx                    # Leaflet map display
│   ├── DrawingBoard.tsx              # Custom shape drawing
│   └── ui/                           # shadcn/ui components
├── lib/
│   ├── graph/
│   │   ├── osm-fetcher.ts            # Dynamic OSM data fetching
│   │   ├── builder.ts                # GeoJSON → Graph
│   │   ├── curve-router.ts           # Direction-aware A*
│   │   ├── spatial-index.ts          # RBush indexing
│   │   ├── router.ts                 # Standard A*
│   │   ├── shape-to-waypoints.ts     # Shape → routable waypoints
│   │   ├── types.ts                  # TypeScript interfaces
│   │   └── utils.ts
│   ├── shapes/
│   │   ├── heart.ts                  # Heart parametric equation
│   │   ├── star.ts                   # Star parametric equation
│   │   ├── circle.ts                 # Circle parametric equation
│   │   ├── square.ts                 # Square parametric equation
│   │   ├── types.ts                  # ShapeDefinition interface
│   │   └── index.ts                  # Shape registry
│   └── payment.ts                    # Stripe utilities
├── fixtures/
│   └── munich-streets.geojson        # Legacy 75MB fixture
├── docs/
│   └── ROUTING_STRATEGY.md           # Detailed routing docs
├── scripts/                          # Build/test scripts
└── test-outputs/                     # Generated test routes
```

---

## 4. Code Style

### 4.1 Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16 | React framework with App Router |
| React | 19 | UI library |
| TypeScript | 5 | Type safety |
| Tailwind CSS | 4 | Utility-first styling |
| Leaflet | 1.9 | Map rendering |
| graphology | 0.26 | Graph data structure |
| RBush | 4 | Spatial indexing |
| fmin | 0.0.4 | Nelder-Mead optimization |
| Stripe | 18 | Payment processing |

### 4.2 Conventions

**File Naming:**
- Components: `PascalCase.tsx` (e.g., `GeoMap.tsx`)
- Utilities: `kebab-case.ts` (e.g., `osm-fetcher.ts`)
- API routes: `route.ts` in folder structure

**Component Patterns:**
- Server components by default
- "use client" directive only when needed
- shadcn/ui for all UI primitives
- Tailwind CSS only (no custom CSS)

**Styling:**
- Light design with white space
- Neutral grays + 1-2 accent colors
- Mobile-first responsive design

### 4.3 Key Interfaces

```typescript
// lib/shapes/types.ts
interface ShapeDefinition {
    name: string
    displayName: string
    description: string
    generate: (numPoints?: number) => Point[]
    estimatedPerimeterRatio?: number
}

// lib/graph/types.ts
interface Coordinate {
    lat: number
    lng: number
}

interface StreetNode {
    id: string
    lat: number
    lng: number
    ways?: string[]
}

interface StreetEdge {
    distance: number
    wayId?: string
    highway?: string
    name?: string
}

interface Route {
    waypoints: Waypoint[]
    segments: RoutePath[]
    totalDistance: number
    coordinates: Coordinate[]
}

interface RoutePath {
    nodeIds: string[]
    coordinates: Coordinate[]
    distance: number
}
```

---

## 5. Testing Strategy

### 5.1 Current State

**No automated test suite exists.** Testing is manual via:
- `scripts/test-curve-router.ts` - Generates test routes to `test-outputs/`
- Visual inspection of generated GeoJSON in mapping tools

### 5.2 Recommended Testing Approach

**Unit Tests (Priority: High)**
- `lib/shapes/*.ts`: Parametric equations generate correct points
- `lib/graph/builder.ts`: Graph construction from GeoJSON
- `lib/graph/spatial-index.ts`: Nearest-node queries
- Quality metric calculations

**Integration Tests (Priority: Medium)**
- `/api/optimized-route`: End-to-end route generation
- OSM fetcher + graph builder pipeline
- Quality assessment and auto-retry logic

**Visual/Manual Tests (Priority: Ongoing)**
- Generated routes render correctly on map
- Shape is recognizable at various scales
- Routes are actually rideable (no impossible segments)

**Test Framework Recommendation:**
- Vitest for unit tests
- Playwright for E2E if adding UI tests

---

## 6. Boundaries

### 6.1 Always Do

- **Fetch OSM data dynamically**: Don't require pre-built fixtures for new locations
- **Validate route quality**: Check distance error, detour ratios before returning
- **Auto-retry on failure**: Try rotation variations (±15°, ±30°, ±45°)
- **Cache aggressively**: 30-minute TTL for OSM graph data
- **Return quality metrics**: Client should know if route is suboptimal
- **Use feature branches**: Never push directly to main

### 6.2 Ask First

- Adding new shape types
- Changing quality thresholds
- Modifying the caching strategy
- Adding new API endpoints
- Changing Stripe integration

### 6.3 Never Do

- **Route through non-rideable ways**: No private roads, footpaths-only for cycling
- **Hardcode secrets**: Use environment variables
- **Skip quality checks**: Always assess route quality
- **Return unconnected points**: Routes must be continuous paths
- **Block on Overpass API**: Implement timeouts and fallbacks

---

## 7. API Reference

### 7.1 Endpoints

| Endpoint | Method | Coverage | Returns |
|----------|--------|----------|---------|
| `/api/optimized-route` | POST | Worldwide | Connected A* routes + quality metrics |
| `/api/shape-route` | POST | Munich only | Connected A* routes (legacy) |
| `/api/fit-fetch` | POST | Worldwide | Points only (no routing) |

### 7.2 Quality Metrics

| Metric | Threshold | Description |
|--------|-----------|-------------|
| `distanceError` | 25% | Actual vs target distance variance |
| `maxDetourRatio` | 6.0x | Worst segment detour vs straight-line |
| `suspiciousSegments` | 2 | Segments with detour > 5x |
| `fallbackPercent` | 30% | Segments needing expanded corridor |

### 7.3 Supported Shapes

| Shape | Distance Ratio | Min Radius | Typical Error |
|-------|---------------|------------|---------------|
| Heart | 10.5 | 800m | ~15% |
| Star | 15.0 | 600m | ~5% |
| Circle | 19.5 | 400m | ~25% |
| Square | 18.5 | 400m | ~12% |

---

## 8. Performance

| Metric | Worldwide (dynamic) | Munich (cached fixture) |
|--------|---------------------|------------------------|
| First request | 3-8s (fetch + build) | ~17s (build from 75MB) |
| Cached request | 0.3-0.5s | 50-100ms |
| Graph size | 1K-20K nodes | ~88K nodes |
| Memory | ~50-200MB per cache | ~500MB |

---

## 9. Revenue Model

- **Freemium:** Basic shapes (heart, star, circle, square) free
- **Premium:** Custom SVG upload, higher quality routes
- **Subscription:** Monthly/yearly for unlimited routes
- **One-time:** Pay per custom route generation
