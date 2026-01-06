# Graph-Based Routing - Complete Development Plan

**Project:** Strava Art - Graph-Based Routing System
**Duration:** 10-15 days (2-3 weeks)
**Objective:** Replace geometric optimization with graph-based pathfinding for faster, rideable routes

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Detailed Project Structure](#detailed-project-structure)
3. [Phase 1: Research & Setup](#phase-1-research--setup-day-1)
4. [Phase 2: Graph Infrastructure](#phase-2-graph-infrastructure-days-2-4)
5. [Phase 3: Pathfinding Implementation](#phase-3-pathfinding-implementation-days-5-7)
6. [Phase 4: Shape-to-Route Generation](#phase-4-shape-to-route-generation-days-8-10)
7. [Phase 5: Integration & API Replacement](#phase-5-integration--api-replacement-days-11-13)
8. [Phase 6: Testing, Optimization & Polish](#phase-6-testing-optimization--polish-days-14-15)
9. [Success Metrics](#success-metrics)
10. [Daily Workflow](#daily-workflow)
11. [Migration Strategy](#migration-strategy)

---

## Project Overview

### Current Problem
- **Performance:** 24+ minutes for single route generation
- **Scalability:** Cannot handle routes >15km
- **OSM API:** Slow and rate-limited
- **Algorithm:** Nelder-Mead optimization with 489,514 nodes is too slow

### Solution: Graph-Based Routing
- Convert street network to queryable graph
- Use A* pathfinding between waypoints
- Generate connected, rideable routes
- Target: <60 seconds for 15km routes

### Key Differences

| Aspect | Current (Geometric) | New (Graph-Based) |
|--------|---------------------|-------------------|
| **Approach** | Snap points to nearest streets | Route along actual streets |
| **Performance** | 24+ minutes | <60 seconds |
| **Rideability** | Not guaranteed | 100% guaranteed |
| **Max Distance** | ~15km | 50km+ |
| **Complexity** | Simple concept | Complex implementation |

---

## Detailed Project Structure

### File Tree (After Implementation)

```
stravart/
├── app/
│   ├── api/
│   │   ├── fit-fetch/
│   │   │   └── route.js              # OLD: Geometric optimization (keep for comparison)
│   │   └── graph-route/
│   │       └── route.ts              # NEW: Graph-based routing endpoint
│   ├── page.tsx                      # Updated with algorithm toggle
│   └── ...
│
├── lib/
│   ├── graph/                        # NEW: Graph routing system
│   │   ├── types.ts                  # TypeScript type definitions
│   │   ├── builder.ts                # GeoJSON → Graph conversion
│   │   ├── router.ts                 # A* pathfinding implementation
│   │   ├── shape-to-waypoints.ts     # Shape → Waypoints conversion
│   │   ├── waypoint-router.ts        # Connect waypoints with routes
│   │   ├── cache.ts                  # Graph caching utilities
│   │   └── utils.ts                  # Helper functions
│   │
│   ├── shapes/                       # EXISTING: Shape generators
│   │   ├── heart.ts
│   │   ├── circle.ts
│   │   ├── star.ts
│   │   ├── square.ts
│   │   ├── index.ts
│   │   └── types.ts
│   │
│   └── utils.ts                      # EXISTING: General utilities
│
├── fixtures/                         # Street data fixtures
│   ├── munich-streets.geojson        # ✅ EXISTING: Munich street network
│   └── munich-graph.json             # NEW: Pre-built graph cache
│
├── scripts/                          # Development & testing scripts
│   ├── fetch-osm-streets.js          # ✅ EXISTING: Fetch OSM data
│   ├── analyze-fixture.js            # NEW: Analyze GeoJSON structure
│   ├── test-graph-build.js           # NEW: Test graph building
│   ├── test-routing.js               # NEW: Test pathfinding
│   ├── test-shape-route.js           # NEW: Test shape generation
│   ├── test-all-shapes.js            # NEW: Comprehensive shape tests
│   └── benchmark.js                  # NEW: Performance benchmarks
│
├── docs/
│   ├── graph-routing-development-plan.md  # THIS FILE
│   ├── graph-routing-architecture.md      # NEW: Technical architecture
│   ├── api-comparison.md                  # NEW: Old vs New comparison
│   └── migration-guide.md                 # NEW: Migration instructions
│
├── test-outputs/                     # NEW: Test result files
│   ├── test-route.geojson           # Example route output
│   ├── heart-route.geojson          # Heart shape test
│   ├── dog-route.geojson            # Complex shape test
│   └── benchmarks.json              # Performance data
│
└── package.json                      # Updated dependencies
```

### New Dependencies

```json
{
  "dependencies": {
    "graphology": "^0.25.4",
    "graphology-shortest-path": "^2.0.2"
  },
  "devDependencies": {
    "graphology-types": "^0.24.7",
    "@types/geojson": "^7946.0.14"
  }
}
```

### Module Breakdown

#### `lib/graph/types.ts`
```typescript
// Core type definitions for graph routing system
- StreetNode
- StreetEdge
- GraphWithIndex
- Route
- Waypoint
- ShapeRoute
```

#### `lib/graph/builder.ts`
```typescript
// Graph construction from GeoJSON
- buildStreetGraph()
- buildGraphWithIndex()
- findNearestNode()
- haversineDistance()
```

#### `lib/graph/router.ts`
```typescript
// A* pathfinding implementation
- findRoute()
- findRouteSafe()
- reconstructPath()
- heuristic()
```

#### `lib/graph/shape-to-waypoints.ts`
```typescript
// Convert shapes to waypoints
- generateWaypoints()
- generateWaypointsFromSVG()
- generateAdaptiveWaypoints()
- simplifyWaypoints()
```

#### `lib/graph/waypoint-router.ts`
```typescript
// Connect waypoints into full route
- routeBetweenWaypoints()
- combineSegments()
- optimizeWaypointOrder()
```

#### `lib/graph/cache.ts`
```typescript
// Graph caching for performance
- saveGraphToCache()
- loadGraphFromCache()
- getCachedGraph()
```

#### `lib/graph/utils.ts`
```typescript
// Helper utilities
- calculateBoundingBox()
- filterByDistance()
- simplifyRoute()
- routeToGeoJSON()
```

---

## Phase 1: Research & Setup (Day 1)

### Objectives
- Install graph libraries
- Create development branch
- Set up test infrastructure
- Study OSM data structure

### Tasks

#### 1.1 Create Branch & Install Dependencies

```bash
git checkout main
git pull
git checkout -b graph-routing

npm install graphology graphology-shortest-path
npm install graphology-types --save-dev
npm install @types/geojson --save-dev
```

#### 1.2 Create Directory Structure

```bash
mkdir -p lib/graph
mkdir -p scripts
mkdir -p test-outputs
mkdir -p docs

touch lib/graph/types.ts
touch lib/graph/builder.ts
touch lib/graph/router.ts
touch lib/graph/shape-to-waypoints.ts
touch lib/graph/waypoint-router.ts
touch lib/graph/cache.ts
touch lib/graph/utils.ts
```

#### 1.3 Analyze Munich Fixture Structure

**Create:** `scripts/analyze-fixture.js`

```javascript
const fs = require('fs')

console.log('Analyzing Munich street fixture...\n')

const geojson = JSON.parse(fs.readFileSync('fixtures/munich-streets.geojson', 'utf8'))

console.log('=== Basic Statistics ===')
console.log('Total features:', geojson.features.length)
console.log('Feature types:', [...new Set(geojson.features.map(f => f.geometry.type))])
console.log('Highway types:', [...new Set(geojson.features.map(f => f.properties.highway))])

console.log('\n=== Sample Feature ===')
console.log(JSON.stringify(geojson.features[0], null, 2))

console.log('\n=== Coordinate Bounds ===')
let minLat = Infinity, maxLat = -Infinity
let minLng = Infinity, maxLng = -Infinity

for (const feature of geojson.features) {
  if (feature.geometry.type === 'LineString') {
    for (const [lng, lat] of feature.geometry.coordinates) {
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
      minLng = Math.min(minLng, lng)
      maxLng = Math.max(maxLng, lng)
    }
  }
}

console.log(`Latitude: ${minLat.toFixed(4)} to ${maxLat.toFixed(4)}`)
console.log(`Longitude: ${minLng.toFixed(4)} to ${maxLng.toFixed(4)}`)

console.log('\n=== Coordinate Count ===')
let totalCoords = 0
for (const feature of geojson.features) {
  if (feature.geometry.type === 'LineString') {
    totalCoords += feature.geometry.coordinates.length
  }
}
console.log('Total coordinates:', totalCoords)
console.log('Average per feature:', (totalCoords / geojson.features.length).toFixed(1))
```

**Run:**
```bash
node scripts/analyze-fixture.js
```

#### 1.4 Create Simple Graph Test

**Create:** `lib/graph/test-simple.ts`

```typescript
import Graph from 'graphology'

console.log('Testing basic graph operations...\n')

// Create simple graph
const graph = new Graph()

graph.addNode('A', { lat: 48.1, lng: 11.5 })
graph.addNode('B', { lat: 48.2, lng: 11.6 })
graph.addNode('C', { lat: 48.15, lng: 11.55 })

graph.addEdge('A', 'B', { distance: 100 })
graph.addEdge('B', 'C', { distance: 50 })
graph.addEdge('A', 'C', { distance: 75 })

console.log('Nodes:', graph.order)
console.log('Edges:', graph.size)
console.log('Neighbors of A:', graph.neighbors('A'))

// Test serialization
const exported = graph.export()
console.log('\nGraph can be serialized:', !!exported)

console.log('\n✅ Basic graph operations working!')
```

**Run:**
```bash
npx tsx lib/graph/test-simple.ts
```

### Success Criteria
- ✅ Libraries installed without errors
- ✅ Can import and use graphology
- ✅ Understand Munich GeoJSON structure
- ✅ Simple graph creation works
- ✅ Know coordinate bounds and data size

### Deliverable
- Working development environment
- Test scripts running
- Documentation of GeoJSON structure
- Confirmed: 106,003 street features, ~489,514 coordinates

---

## Phase 2: Graph Infrastructure (Days 2-4)

### Objectives
- Convert Munich GeoJSON to graph
- Implement spatial indexing
- Query graph by location
- Measure graph build performance

### Tasks

#### 2.1 Build Basic Graph from GeoJSON

**Create:** `lib/graph/types.ts`

```typescript
import Graph from 'graphology'
import RBush from 'rbush'

export interface StreetNode {
  id: string
  lat: number
  lng: number
}

export interface StreetEdge {
  distance: number
  highway: string
  name?: string
}

export interface GraphWithIndex {
  graph: Graph
  spatialIndex: RBush<any>
}

export interface Route {
  nodes: string[]
  coordinates: [number, number][]
  distance: number
  segments: number
}

export interface Waypoint {
  lat: number
  lng: number
  index: number
}

export interface ShapeRoute {
  fullRoute: [number, number][]
  segments: Array<{
    from: number
    to: number
    route: Route
  }>
  totalDistance: number
  waypointCount: number
}
```

**Create:** `lib/graph/builder.ts`

```typescript
import Graph from 'graphology'
import RBush from 'rbush'
import knn from 'rbush-knn'
import { GraphWithIndex, StreetNode, StreetEdge } from './types'

export function buildStreetGraph(geojson: any): Graph {
  const graph = new Graph()

  console.time('Graph building')

  let edgeCount = 0

  for (const feature of geojson.features) {
    if (feature.geometry.type !== 'LineString') continue

    const coords = feature.geometry.coordinates
    const highway = feature.properties.highway
    const name = feature.properties.name

    // Create nodes and edges from LineString
    for (let i = 0; i < coords.length - 1; i++) {
      const [lng1, lat1] = coords[i]
      const [lng2, lat2] = coords[i + 1]

      // Create unique node IDs (6 decimal places = ~10cm precision)
      const nodeId1 = `${lng1.toFixed(6)},${lat1.toFixed(6)}`
      const nodeId2 = `${lng2.toFixed(6)},${lat2.toFixed(6)}`

      // Add nodes if they don't exist
      if (!graph.hasNode(nodeId1)) {
        graph.addNode(nodeId1, { lat: lat1, lng: lng1 })
      }
      if (!graph.hasNode(nodeId2)) {
        graph.addNode(nodeId2, { lat: lat2, lng: lng2 })
      }

      // Calculate distance
      const distance = haversineDistance(lat1, lng1, lat2, lng2)

      // Add bidirectional edges (streets go both ways)
      const edgeAttrs: StreetEdge = { distance, highway, name }

      if (!graph.hasEdge(nodeId1, nodeId2)) {
        graph.addEdge(nodeId1, nodeId2, edgeAttrs)
        edgeCount++
      }
      if (!graph.hasEdge(nodeId2, nodeId1)) {
        graph.addEdge(nodeId2, nodeId1, edgeAttrs)
        edgeCount++
      }
    }
  }

  console.timeEnd('Graph building')
  console.log(`Graph: ${graph.order} nodes, ${graph.size} edges`)

  return graph
}

export function buildGraphWithIndex(geojson: any): GraphWithIndex {
  const graph = buildStreetGraph(geojson)

  console.time('Spatial index building')

  // Build RBush index for fast nearest-node queries
  const items = graph.nodes().map(nodeId => {
    const attrs = graph.getNodeAttributes(nodeId)
    return {
      minX: attrs.lng,
      minY: attrs.lat,
      maxX: attrs.lng,
      maxY: attrs.lat,
      nodeId,
      lat: attrs.lat,
      lng: attrs.lng
    }
  })

  const spatialIndex = new RBush()
  spatialIndex.load(items)

  console.timeEnd('Spatial index building')

  return { graph, spatialIndex }
}

export function findNearestNode(
  spatialIndex: RBush<any>,
  lat: number,
  lng: number
): string {
  const nearest = knn(spatialIndex, lng, lat, 1)[0]
  return nearest.nodeId
}

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000 // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c
}
```

#### 2.2 Test Graph Building

**Create:** `scripts/test-graph-build.js`

```javascript
const fs = require('fs')
const { buildGraphWithIndex, findNearestNode } = require('../lib/graph/builder')

console.log('=== Graph Building Test ===\n')

const geojson = JSON.parse(fs.readFileSync('fixtures/munich-streets.geojson', 'utf8'))

console.log('Building graph from Munich fixture...\n')

const { graph, spatialIndex } = buildGraphWithIndex(geojson)

console.log('\n=== Graph Statistics ===')
console.log('Nodes:', graph.order)
console.log('Edges:', graph.size)
console.log('Average degree:', (graph.size / graph.order).toFixed(2))

// Sample some nodes
const sampleNodes = graph.nodes().slice(0, 5)
console.log('\n=== Sample Nodes ===')
sampleNodes.forEach(nodeId => {
  const attrs = graph.getNodeAttributes(nodeId)
  const degree = graph.degree(nodeId)
  console.log(`${nodeId}: degree ${degree}, neighbors: ${graph.neighbors(nodeId).slice(0, 3).join(', ')}`)
})

// Test nearest node query
console.log('\n=== Testing Spatial Index ===')
const testLat = 48.1351 // Marienplatz
const testLng = 11.5820
console.time('Find nearest node')
const nearest = findNearestNode(spatialIndex, testLat, testLng)
console.timeEnd('Find nearest node')
console.log('Query point:', testLat, testLng)
console.log('Nearest node:', nearest)
const nearestAttrs = graph.getNodeAttributes(nearest)
console.log('Node location:', nearestAttrs.lat, nearestAttrs.lng)

console.log('\n✅ Graph building successful!')
```

**Run:**
```bash
node scripts/test-graph-build.js
```

#### 2.3 Implement Graph Caching

**Create:** `lib/graph/cache.ts`

```typescript
import fs from 'fs'
import path from 'path'
import Graph from 'graphology'

export function saveGraphToCache(graph: Graph, cachePath: string): void {
  console.time('Graph serialization')
  const serialized = graph.export()
  console.timeEnd('Graph serialization')

  console.time('Writing to disk')
  fs.writeFileSync(cachePath, JSON.stringify(serialized))
  console.timeEnd('Writing to disk')

  const sizeKB = (fs.statSync(cachePath).size / 1024).toFixed(2)
  console.log(`Graph cached to ${cachePath} (${sizeKB} KB)`)
}

export function loadGraphFromCache(cachePath: string): Graph | null {
  try {
    if (!fs.existsSync(cachePath)) {
      console.log('No cache found at', cachePath)
      return null
    }

    console.time('Reading from disk')
    const serialized = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    console.timeEnd('Reading from disk')

    console.time('Graph deserialization')
    const graph = new Graph()
    graph.import(serialized)
    console.timeEnd('Graph deserialization')

    console.log(`Graph loaded from cache: ${graph.order} nodes, ${graph.size} edges`)
    return graph
  } catch (error: any) {
    console.error('Cache load failed:', error.message)
    return null
  }
}

export function getCachedGraph(
  geojson: any,
  cachePath: string
): Graph {
  // Try to load from cache
  let graph = loadGraphFromCache(cachePath)

  if (!graph) {
    // Build from scratch
    console.log('Building graph from GeoJSON...')
    const { buildStreetGraph } = require('./builder')
    graph = buildStreetGraph(geojson)

    // Save to cache
    saveGraphToCache(graph, cachePath)
  }

  return graph
}
```

**Test caching:**

```javascript
// Add to test-graph-build.js
const { getCachedGraph } = require('../lib/graph/cache')

const cachePath = 'fixtures/munich-graph.json'
const graph = getCachedGraph(geojson, cachePath)
```

### Success Criteria
- ✅ Munich fixture converts to graph in <10 seconds
- ✅ Graph has 20,000-50,000 nodes (estimated)
- ✅ Graph has 40,000-100,000 edges (bidirectional)
- ✅ Nearest node query runs in <1ms
- ✅ Graph can be cached and loaded
- ✅ Cached graph loads in <2 seconds
- ✅ Memory usage is reasonable (<500MB)

### Deliverable
- Working graph builder (`lib/graph/builder.ts`)
- Spatial index for fast queries
- Caching system (`lib/graph/cache.ts`)
- Test scripts
- Performance metrics document

---

## Phase 3: Pathfinding Implementation (Days 5-7)

### Objectives
- Implement A* pathfinding
- Find routes between any two nodes
- Measure routing performance
- Handle edge cases (unreachable nodes, etc.)

### Tasks

#### 3.1 Implement A* Algorithm

**Create:** `lib/graph/router.ts`

```typescript
import Graph from 'graphology'
import { astar } from 'graphology-shortest-path'
import { haversineDistance } from './builder'
import { Route } from './types'

export function findRoute(
  graph: Graph,
  startNodeId: string,
  endNodeId: string
): Route | null {
  console.time(`Route ${startNodeId.slice(0, 10)}... → ${endNodeId.slice(0, 10)}...`)

  try {
    // Use graphology's A* implementation
    const path = astar.bidirectional(
      graph,
      startNodeId,
      endNodeId,
      // Edge weight function
      (edge, attr, source, target) => attr.distance,
      // Heuristic function (straight-line distance to goal)
      (nodeId) => {
        const nodeAttrs = graph.getNodeAttributes(nodeId)
        const endAttrs = graph.getNodeAttributes(endNodeId)
        return haversineDistance(
          nodeAttrs.lat, nodeAttrs.lng,
          endAttrs.lat, endAttrs.lng
        )
      }
    )

    console.timeEnd(`Route ${startNodeId.slice(0, 10)}... → ${endNodeId.slice(0, 10)}...`)

    if (!path || path.length === 0) {
      console.warn('No route found')
      return null
    }

    // Convert to coordinates
    const coordinates = path.map(nodeId => {
      const attrs = graph.getNodeAttributes(nodeId)
      return [attrs.lng, attrs.lat] as [number, number]
    })

    // Calculate total distance
    let totalDistance = 0
    for (let i = 0; i < path.length - 1; i++) {
      const edge = graph.getEdgeAttributes(path[i], path[i + 1])
      totalDistance += edge.distance
    }

    return {
      nodes: path,
      coordinates,
      distance: totalDistance,
      segments: path.length - 1
    }
  } catch (error: any) {
    console.error('Routing error:', error.message)
    console.timeEnd(`Route ${startNodeId.slice(0, 10)}... → ${endNodeId.slice(0, 10)}...`)
    return null
  }
}

export function findRouteSafe(
  graph: Graph,
  spatialIndex: any,
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Route | null {
  try {
    const { findNearestNode } = require('./builder')

    // Find nearest nodes
    const startNode = findNearestNode(spatialIndex, startLat, startLng)
    const endNode = findNearestNode(spatialIndex, endLat, endLng)

    if (!startNode || !endNode) {
      console.error('Could not find nearest nodes')
      return null
    }

    // Check if nodes exist in graph
    if (!graph.hasNode(startNode) || !graph.hasNode(endNode)) {
      console.error('Nodes not in graph')
      return null
    }

    // Find route
    const route = findRoute(graph, startNode, endNode)

    return route
  } catch (error: any) {
    console.error('Safe routing error:', error)
    return null
  }
}
```

#### 3.2 Test Routing Between Points

**Create:** `scripts/test-routing.js`

```javascript
const { buildGraphWithIndex, findNearestNode } = require('../lib/graph/builder')
const { findRoute, findRouteSafe } = require('../lib/graph/router')
const fs = require('fs')

console.log('=== Routing Test ===\n')

const geojson = JSON.parse(fs.readFileSync('fixtures/munich-streets.geojson', 'utf8'))
const { graph, spatialIndex } = buildGraphWithIndex(geojson)

// Test 1: Marienplatz to Olympiapark
console.log('\n--- Test 1: Marienplatz → Olympiapark ---')
const marienplatz = { lat: 48.1374, lng: 11.5755 }
const olympiapark = { lat: 48.1733, lng: 11.5525 }

const route1 = findRouteSafe(
  graph,
  spatialIndex,
  marienplatz.lat, marienplatz.lng,
  olympiapark.lat, olympiapark.lng
)

if (route1) {
  console.log(`✅ Route found!`)
  console.log(`Distance: ${(route1.distance / 1000).toFixed(2)} km`)
  console.log(`Segments: ${route1.segments}`)
  console.log(`Points: ${route1.coordinates.length}`)

  // Save as GeoJSON
  const geojson1 = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: route1.coordinates
    },
    properties: {
      from: 'Marienplatz',
      to: 'Olympiapark',
      distance: route1.distance,
      segments: route1.segments
    }
  }
  fs.writeFileSync('test-outputs/marienplatz-olympiapark.geojson', JSON.stringify(geojson1, null, 2))
  console.log('Saved to: test-outputs/marienplatz-olympiapark.geojson')
} else {
  console.log('❌ No route found')
}

// Test 2: Random nearby points
console.log('\n--- Test 2: Random Points (500m apart) ---')
const randomStart = { lat: 48.15, lng: 11.58 }
const randomEnd = { lat: 48.154, lng: 11.585 }

const route2 = findRouteSafe(
  graph,
  spatialIndex,
  randomStart.lat, randomStart.lng,
  randomEnd.lat, randomEnd.lng
)

if (route2) {
  console.log(`✅ Route found!`)
  console.log(`Distance: ${route2.distance.toFixed(0)} meters`)
  console.log(`Segments: ${route2.segments}`)
} else {
  console.log('❌ No route found')
}

// Test 3: Performance benchmark (10 random routes)
console.log('\n--- Test 3: Performance Benchmark ---')
console.time('10 random routes')

let successCount = 0
for (let i = 0; i < 10; i++) {
  const lat1 = 48.1 + Math.random() * 0.2
  const lng1 = 11.5 + Math.random() * 0.2
  const lat2 = 48.1 + Math.random() * 0.2
  const lng2 = 11.5 + Math.random() * 0.2

  const route = findRouteSafe(graph, spatialIndex, lat1, lng1, lat2, lng2)
  if (route) successCount++
}

console.timeEnd('10 random routes')
console.log(`Success rate: ${successCount}/10`)

console.log('\n✅ Routing tests complete!')
console.log('\nVisualize routes at https://geojson.io')
```

**Run:**
```bash
node scripts/test-routing.js
```

#### 3.3 Add Route Utilities

**Create:** `lib/graph/utils.ts`

```typescript
import { Route } from './types'

export function routeToGeoJSON(route: Route, properties: any = {}) {
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: route.coordinates
    },
    properties: {
      distance: route.distance,
      segments: route.segments,
      ...properties
    }
  }
}

export function combineRoutes(routes: Route[]): Route {
  const allCoords: [number, number][] = []
  const allNodes: string[] = []
  let totalDistance = 0

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]

    // Skip first coordinate if not first route (avoid duplicates)
    const coords = i === 0 ? route.coordinates : route.coordinates.slice(1)
    const nodes = i === 0 ? route.nodes : route.nodes.slice(1)

    allCoords.push(...coords)
    allNodes.push(...nodes)
    totalDistance += route.distance
  }

  return {
    nodes: allNodes,
    coordinates: allCoords,
    distance: totalDistance,
    segments: allNodes.length - 1
  }
}

export function simplifyRoute(route: Route, tolerance: number = 0.0001): Route {
  // Ramer-Douglas-Peucker algorithm for coordinate simplification
  // Keep nodes array intact, only simplify coordinates for display
  const simplified = simplifyRDP(route.coordinates, tolerance)

  return {
    ...route,
    coordinates: simplified
  }
}

function simplifyRDP(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length < 3) return points

  // ... RDP implementation (can reuse from existing code)

  return points
}
```

### Success Criteria
- ✅ Can route between any 2 points in Munich
- ✅ Routing completes in <1 second for 5km routes
- ✅ Routes follow actual streets (validate on geojson.io)
- ✅ Handles unreachable destinations gracefully
- ✅ Route distance matches expected (±10%)
- ✅ 90%+ success rate for random point pairs

### Deliverable
- Working A* pathfinding (`lib/graph/router.ts`)
- Test scripts with example routes
- GeoJSON outputs for visualization
- Error handling for edge cases
- Performance benchmarks

---

## Phase 4: Shape-to-Route Generation (Days 8-10)

### Objectives
- Convert shapes to waypoints
- Route between consecutive waypoints
- Combine segments into full route
- Optimize waypoint density for quality

### Tasks

#### 4.1 Generate Waypoints from Shapes

**Create:** `lib/graph/shape-to-waypoints.ts`

```typescript
import { generateShapePoints } from '@/lib/shapes'
import { Waypoint } from './types'

export function generateWaypoints(
  shapeName: string,
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
  waypointCount: number = 30
): Waypoint[] {
  console.log(`Generating ${waypointCount} waypoints for ${shapeName}`)

  // Generate shape outline points
  const shapePoints = generateShapePoints(shapeName, waypointCount)

  // Convert normalized shape coordinates to lat/lng
  const waypoints = shapePoints.map((point, index) => {
    // Convert meters to degrees
    const latOffset = (point.y * radiusMeters) / 111320
    const lngOffset = (point.x * radiusMeters) /
      ((40075000 * Math.cos((centerLat * Math.PI) / 180)) / 360)

    return {
      lat: centerLat + latOffset,
      lng: centerLng + lngOffset,
      index
    }
  })

  return waypoints
}

export function generateWaypointsFromSVG(
  svgString: string,
  centerLat: number,
  centerLng: number,
  radiusMeters: number
): Waypoint[] {
  console.log('Generating waypoints from custom SVG')

  // Parse SVG (reuse existing parseSvgPathsAndPolylines)
  const points = parseSvgPathsAndPolylines(svgString)

  if (points.length === 0) {
    throw new Error('No points extracted from SVG')
  }

  // Simplify to reasonable number of waypoints (20-40)
  const simplified = simplifyPoints(points, Math.max(20, Math.min(40, points.length / 3)))

  // Convert to lat/lng
  return simplified.map((point, index) => {
    const latOffset = (point.y * radiusMeters) / 111320
    const lngOffset = (point.x * radiusMeters) /
      ((40075000 * Math.cos((centerLat * Math.PI) / 180)) / 360)

    return {
      lat: centerLat + latOffset,
      lng: centerLng + lngOffset,
      index
    }
  })
}

export function generateAdaptiveWaypoints(
  shapeName: string,
  centerLat: number,
  centerLng: number,
  radiusMeters: number
): Waypoint[] {
  // Determine optimal waypoint count based on shape size and complexity
  let waypointCount = 25

  // Adjust for size
  if (radiusMeters > 5000) {
    waypointCount = 45
  } else if (radiusMeters > 3000) {
    waypointCount = 35
  } else if (radiusMeters < 1000) {
    waypointCount = 20
  }

  // Adjust for complexity
  const complexShapes = ['star', 'custom']
  if (complexShapes.includes(shapeName)) {
    waypointCount = Math.floor(waypointCount * 1.3)
  }

  console.log(`Adaptive waypoint count: ${waypointCount} for ${shapeName} (${radiusMeters}m)`)

  return generateWaypoints(shapeName, centerLat, centerLng, radiusMeters, waypointCount)
}

// Helper functions
function parseSvgPathsAndPolylines(svgString: string): any[] {
  // Reuse existing implementation from app/api/fit-fetch/route.js
  // ... (copy existing code)
  return []
}

function simplifyPoints(points: any[], targetCount: number): any[] {
  // Simple decimation or RDP
  if (points.length <= targetCount) return points

  const step = Math.floor(points.length / targetCount)
  return points.filter((_, i) => i % step === 0).slice(0, targetCount)
}
```

#### 4.2 Connect Waypoints with Routes

**Create:** `lib/graph/waypoint-router.ts`

```typescript
import Graph from 'graphology'
import RBush from 'rbush'
import { findRouteSafe } from './router'
import { Waypoint, ShapeRoute, Route } from './types'

export function routeBetweenWaypoints(
  waypoints: Waypoint[],
  graph: Graph,
  spatialIndex: RBush<any>
): ShapeRoute | null {
  const segments: Array<{ from: number; to: number; route: Route }> = []
  const fullRoute: [number, number][] = []
  let totalDistance = 0

  console.log(`\nRouting between ${waypoints.length} waypoints...`)
  console.time('Total waypoint routing')

  // Route between each consecutive pair (including loop back to start)
  for (let i = 0; i < waypoints.length; i++) {
    const start = waypoints[i]
    const end = waypoints[(i + 1) % waypoints.length]

    process.stdout.write(`\rRouting segment ${i + 1}/${waypoints.length}...`)

    const route = findRouteSafe(
      graph,
      spatialIndex,
      start.lat,
      start.lng,
      end.lat,
      end.lng
    )

    if (!route) {
      console.error(`\n⚠️  Failed to route from waypoint ${i} to ${(i + 1) % waypoints.length}`)
      // Continue with remaining waypoints instead of failing completely
      continue
    }

    segments.push({
      from: i,
      to: (i + 1) % waypoints.length,
      route
    })

    // Add route coordinates (skip first point if not first segment to avoid duplicates)
    const coords = i === 0 ? route.coordinates : route.coordinates.slice(1)
    fullRoute.push(...coords)

    totalDistance += route.distance
  }

  console.log('') // New line after progress
  console.timeEnd('Total waypoint routing')

  if (segments.length === 0) {
    console.error('❌ No segments could be routed')
    return null
  }

  const successRate = (segments.length / waypoints.length * 100).toFixed(1)
  console.log(`✅ Successfully routed ${segments.length}/${waypoints.length} segments (${successRate}%)`)
  console.log(`📏 Total distance: ${(totalDistance / 1000).toFixed(2)} km`)
  console.log(`📍 Total points: ${fullRoute.length}`)

  return {
    fullRoute,
    segments,
    totalDistance,
    waypointCount: waypoints.length
  }
}

export function optimizeWaypointOrder(
  waypoints: Waypoint[],
  graph: Graph,
  spatialIndex: RBush<any>
): Waypoint[] {
  // Optional: Try to optimize waypoint order to minimize total distance
  // For now, keep original order (shapes define their own order)
  return waypoints
}
```

#### 4.3 Test Shape Generation End-to-End

**Create:** `scripts/test-shape-route.js`

```javascript
const { buildGraphWithIndex } = require('../lib/graph/builder')
const { generateWaypoints, generateAdaptiveWaypoints } = require('../lib/graph/shape-to-waypoints')
const { routeBetweenWaypoints } = require('../lib/graph/waypoint-router')
const fs = require('fs')

console.log('=== Shape Route Test ===\n')

console.log('Loading Munich graph...')
const geojson = JSON.parse(fs.readFileSync('fixtures/munich-streets.geojson', 'utf8'))
const { graph, spatialIndex } = buildGraphWithIndex(geojson)

// Test different shapes
const testCases = [
  { shape: 'heart', center: { lat: 48.1351, lng: 11.5820 }, radius: 2000 },
  { shape: 'circle', center: { lat: 48.1500, lng: 11.5700 }, radius: 1500 },
  { shape: 'star', center: { lat: 48.1400, lng: 11.5900 }, radius: 2500 },
  { shape: 'square', center: { lat: 48.1600, lng: 11.5600 }, radius: 1800 }
]

for (const test of testCases) {
  console.log(`\n========================================`)
  console.log(`Testing ${test.shape.toUpperCase()} shape`)
  console.log(`========================================`)

  // Generate waypoints
  const waypoints = generateAdaptiveWaypoints(
    test.shape,
    test.center.lat,
    test.center.lng,
    test.radius
  )

  console.log(`Generated ${waypoints.length} waypoints`)

  // Route between waypoints
  const shapeRoute = routeBetweenWaypoints(waypoints, graph, spatialIndex)

  if (shapeRoute) {
    console.log(`\n✅ ${test.shape.toUpperCase()} route created successfully!`)
    console.log(`Distance: ${(shapeRoute.totalDistance / 1000).toFixed(2)} km`)
    console.log(`Points: ${shapeRoute.fullRoute.length}`)

    // Save as GeoJSON
    const routeGeoJSON = {
      type: 'FeatureCollection',
      features: [
        // Main route
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: shapeRoute.fullRoute
          },
          properties: {
            shape: test.shape,
            distance: shapeRoute.totalDistance,
            waypoints: shapeRoute.waypointCount,
            segments: shapeRoute.segments.length
          }
        },
        // Waypoints as points
        ...waypoints.map((wp, i) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [wp.lng, wp.lat]
          },
          properties: {
            index: i,
            type: 'waypoint'
          }
        }))
      ]
    }

    const filename = `test-outputs/${test.shape}-route.geojson`
    fs.writeFileSync(filename, JSON.stringify(routeGeoJSON, null, 2))
    console.log(`Saved to: ${filename}`)
  } else {
    console.log(`❌ Failed to create ${test.shape} route`)
  }
}

console.log('\n========================================')
console.log('All shape tests complete!')
console.log('========================================')
console.log('\nVisualize routes at https://geojson.io')
console.log('Drag and drop the .geojson files from test-outputs/')
```

**Run:**
```bash
node scripts/test-shape-route.js
```

#### 4.4 Benchmark Performance

**Create:** `scripts/benchmark.js`

```javascript
const { buildGraphWithIndex } = require('../lib/graph/builder')
const { generateAdaptiveWaypoints } = require('../lib/graph/shape-to-waypoints')
const { routeBetweenWaypoints } = require('../lib/graph/waypoint-router')
const fs = require('fs')

console.log('=== Performance Benchmark ===\n')

const geojson = JSON.parse(fs.readFileSync('fixtures/munich-streets.geojson', 'utf8'))
const { graph, spatialIndex } = buildGraphWithIndex(geojson)

const benchmarks = []

// Test different sizes
const testSizes = [
  { name: 'Small (1km)', radius: 1000 },
  { name: 'Medium (2km)', radius: 2000 },
  { name: 'Large (5km)', radius: 5000 },
  { name: 'XL (10km)', radius: 10000 }
]

const center = { lat: 48.1351, lng: 11.5820 }

for (const size of testSizes) {
  console.log(`\nTesting ${size.name}...`)

  const start = Date.now()

  const waypoints = generateAdaptiveWaypoints('heart', center.lat, center.lng, size.radius)
  const waypointTime = Date.now() - start

  const routeStart = Date.now()
  const route = routeBetweenWaypoints(waypoints, graph, spatialIndex)
  const routeTime = Date.now() - routeStart

  const totalTime = Date.now() - start

  if (route) {
    const result = {
      size: size.name,
      radius: size.radius,
      waypoints: waypoints.length,
      segments: route.segments.length,
      distance: (route.totalDistance / 1000).toFixed(2) + ' km',
      points: route.fullRoute.length,
      waypointTime: waypointTime + 'ms',
      routeTime: routeTime + 'ms',
      totalTime: totalTime + 'ms'
    }

    benchmarks.push(result)

    console.log(JSON.stringify(result, null, 2))
  }
}

// Save benchmarks
fs.writeFileSync('test-outputs/benchmarks.json', JSON.stringify(benchmarks, null, 2))
console.log('\n✅ Benchmarks saved to test-outputs/benchmarks.json')

// Summary
console.log('\n=== Summary ===')
console.table(benchmarks)
```

**Run:**
```bash
node scripts/benchmark.js
```

### Success Criteria
- ✅ Heart shape generates recognizable route
- ✅ All basic shapes (heart, circle, star, square) work
- ✅ Routes complete in <30 seconds for 2km shapes
- ✅ Routes complete in <60 seconds for 5km shapes
- ✅ 90%+ waypoint routing success rate
- ✅ Routes are continuous (no gaps)
- ✅ Shape is recognizable on map

### Deliverable
- Waypoint generation system
- Waypoint routing logic
- Test scripts for all shapes
- GeoJSON outputs for visualization
- Performance benchmarks
- Comparison with old algorithm

---

## Phase 5: Integration & API Replacement (Days 11-13)

### Objectives
- Create new API endpoint
- Update frontend to use graph routing
- Add algorithm toggle for comparison
- Handle all shape types and custom SVG

### Tasks

#### 5.1 Create New API Endpoint

**Create:** `app/api/graph-route/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { buildGraphWithIndex } from '@/lib/graph/builder'
import { loadGraphFromCache, saveGraphToCache } from '@/lib/graph/cache'
import { generateWaypoints, generateWaypointsFromSVG, generateAdaptiveWaypoints } from '@/lib/graph/shape-to-waypoints'
import { routeBetweenWaypoints } from '@/lib/graph/waypoint-router'

// Global cache for graph (persists across requests)
let cachedGraph: any = null

function getGraph() {
  if (cachedGraph) {
    console.log('Using cached graph from memory')
    return cachedGraph
  }

  const fixturePath = path.join(process.cwd(), 'fixtures/munich-streets.geojson')
  const cachePath = path.join(process.cwd(), 'fixtures/munich-graph.json')

  // Try to load from disk cache
  let graph = loadGraphFromCache(cachePath)

  if (!graph) {
    // Build from GeoJSON
    console.log('Building graph from GeoJSON fixture...')
    const geojson = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
    const result = buildGraphWithIndex(geojson)

    // Save to disk for next time
    saveGraphToCache(result.graph, cachePath)

    cachedGraph = result
    return result
  }

  // Need to rebuild spatial index (not serialized)
  console.log('Rebuilding spatial index...')
  const { buildGraphWithIndex } = require('@/lib/graph/builder')
  const geojson = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  cachedGraph = buildGraphWithIndex(geojson)

  return cachedGraph
}

export async function POST(request: NextRequest) {
  try {
    console.log('\n=== Graph Route Request ===')
    const startTime = Date.now()

    const body = await request.json()
    const { location, radius, selectedShape, svgString } = body

    console.log('Location:', location)
    console.log('Radius:', radius)
    console.log('Shape:', selectedShape || 'custom SVG')

    // Get graph (cached)
    const graphStart = Date.now()
    const { graph, spatialIndex } = getGraph()
    const graphTime = Date.now() - graphStart
    console.log(`Graph loaded in ${graphTime}ms`)

    // Generate waypoints
    const waypointStart = Date.now()
    let waypoints

    if (svgString) {
      waypoints = generateWaypointsFromSVG(svgString, location.lat, location.lng, radius)
    } else {
      waypoints = generateAdaptiveWaypoints(selectedShape, location.lat, location.lng, radius)
    }

    const waypointTime = Date.now() - waypointStart
    console.log(`Waypoints generated in ${waypointTime}ms (${waypoints.length} points)`)

    // Route between waypoints
    const routeStart = Date.now()
    const shapeRoute = routeBetweenWaypoints(waypoints, graph, spatialIndex)
    const routeTime = Date.now() - routeStart

    if (!shapeRoute) {
      return NextResponse.json(
        { error: 'Failed to create route between waypoints' },
        { status: 500 }
      )
    }

    // Convert to GeoJSON format expected by frontend
    const geojson = {
      type: 'FeatureCollection',
      features: shapeRoute.fullRoute.map((coord, index) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: coord
        },
        properties: {
          index,
          totalDistance: shapeRoute.totalDistance
        }
      }))
    }

    const totalTime = Date.now() - startTime

    console.log(`\n✅ Route created successfully!`)
    console.log(`Total time: ${totalTime}ms`)
    console.log(`  - Graph: ${graphTime}ms`)
    console.log(`  - Waypoints: ${waypointTime}ms`)
    console.log(`  - Routing: ${routeTime}ms`)
    console.log(`Distance: ${(shapeRoute.totalDistance / 1000).toFixed(2)} km`)
    console.log(`Points: ${shapeRoute.fullRoute.length}`)

    return NextResponse.json(geojson)

  } catch (error: any) {
    console.error('Graph routing error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
```

#### 5.2 Update Frontend with Algorithm Toggle

**Modify:** `app/page.tsx`

Add state for algorithm selection:

```typescript
// Add near other state declarations
const [useGraphRouting, setUseGraphRouting] = useState(true)
const [routingMetrics, setRoutingMetrics] = useState<{
  algorithm: string
  time: number
  distance: number
} | null>(null)
```

Update fetchRoute function:

```typescript
const fetchRoute = async () => {
  setIsLoading(true)
  setError(null)
  setResultData(null)
  setRoutingMetrics(null)

  try {
    const endpoint = useGraphRouting ? '/api/graph-route' : '/api/fit-fetch'
    const startTime = Date.now()

    const response = await axios.post(endpoint, {
      location: selectedLocation,
      radius,
      selectedShape,
      svgString: svgPath
    })

    const time = Date.now() - startTime

    setResultData(response.data)

    // Calculate distance from result
    let distance = 0
    if (response.data.features && response.data.features.length > 0) {
      distance = response.data.features[0].properties?.totalDistance || 0
    }

    setRoutingMetrics({
      algorithm: useGraphRouting ? 'Graph Routing' : 'Geometric Optimization',
      time,
      distance
    })

  } catch (err: any) {
    setError(err.response?.data?.error || err.message)
  } finally {
    setIsLoading(false)
  }
}
```

Add UI toggle in the form section:

```tsx
{/* Algorithm Selection */}
<div className="space-y-2">
  <label className="text-sm font-medium">Routing Algorithm</label>
  <div className="flex gap-2">
    <Button
      type="button"
      variant={useGraphRouting ? "default" : "outline"}
      size="sm"
      onClick={() => setUseGraphRouting(true)}
      className="flex-1"
    >
      Graph Routing (New)
    </Button>
    <Button
      type="button"
      variant={!useGraphRouting ? "default" : "outline"}
      size="sm"
      onClick={() => setUseGraphRouting(false)}
      className="flex-1"
    >
      Geometric (Old)
    </Button>
  </div>
  <p className="text-xs text-muted-foreground">
    {useGraphRouting
      ? 'Fast graph-based pathfinding with guaranteed rideable routes'
      : 'Original geometric optimization (slower, good for comparison)'}
  </p>
</div>

{/* Performance Metrics */}
{routingMetrics && (
  <div className="p-4 bg-muted rounded-lg space-y-2">
    <div className="text-sm font-medium">Performance</div>
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div>
        <span className="text-muted-foreground">Algorithm:</span>
        <span className="ml-2 font-medium">{routingMetrics.algorithm}</span>
      </div>
      <div>
        <span className="text-muted-foreground">Time:</span>
        <span className="ml-2 font-medium">{(routingMetrics.time / 1000).toFixed(1)}s</span>
      </div>
      <div className="col-span-2">
        <span className="text-muted-foreground">Distance:</span>
        <span className="ml-2 font-medium">{(routingMetrics.distance / 1000).toFixed(2)} km</span>
      </div>
    </div>
  </div>
)}
```

#### 5.3 Test All Shape Types

**Create:** `scripts/test-all-shapes.js`

```javascript
const axios = require('axios')

console.log('=== Testing All Shapes via API ===\n')

const API_URL = 'http://localhost:3000/api/graph-route'

const testCases = [
  {
    name: 'Heart - Small',
    location: { lat: 48.1351, lng: 11.5820 },
    radius: 1000,
    selectedShape: 'heart'
  },
  {
    name: 'Circle - Medium',
    location: { lat: 48.1500, lng: 11.5700 },
    radius: 2000,
    selectedShape: 'circle'
  },
  {
    name: 'Star - Large',
    location: { lat: 48.1400, lng: 11.5900 },
    radius: 3000,
    selectedShape: 'star'
  },
  {
    name: 'Square - XL',
    location: { lat: 48.1600, lng: 11.5600 },
    radius: 5000,
    selectedShape: 'square'
  }
]

async function testShape(testCase) {
  console.log(`\nTesting: ${testCase.name}`)
  console.log(`Location: ${testCase.location.lat}, ${testCase.location.lng}`)
  console.log(`Radius: ${testCase.radius}m`)

  const start = Date.now()

  try {
    const response = await axios.post(API_URL, {
      location: testCase.location,
      radius: testCase.radius,
      selectedShape: testCase.selectedShape
    })

    const time = Date.now() - start

    if (response.data.features && response.data.features.length > 0) {
      const distance = response.data.features[0].properties?.totalDistance || 0

      console.log(`✅ Success!`)
      console.log(`   Time: ${time}ms`)
      console.log(`   Distance: ${(distance / 1000).toFixed(2)} km`)
      console.log(`   Points: ${response.data.features.length}`)

      return { success: true, time, distance }
    } else {
      console.log(`❌ Failed: No features in response`)
      return { success: false }
    }
  } catch (error) {
    const time = Date.now() - start
    console.log(`❌ Error: ${error.message}`)
    console.log(`   Time: ${time}ms`)
    return { success: false, error: error.message }
  }
}

async function runTests() {
  console.log('Make sure dev server is running on http://localhost:3000\n')

  const results = []

  for (const testCase of testCases) {
    const result = await testShape(testCase)
    results.push({ name: testCase.name, ...result })
  }

  console.log('\n=== Summary ===')
  console.table(results)

  const successCount = results.filter(r => r.success).length
  console.log(`\n${successCount}/${results.length} tests passed`)
}

runTests()
```

**Run (with dev server):**
```bash
npm run dev
# In another terminal:
node scripts/test-all-shapes.js
```

#### 5.4 Update Documentation

**Create:** `docs/api-comparison.md`

```markdown
# API Comparison: Geometric vs Graph Routing

## Endpoints

### Old: `/api/fit-fetch` (Geometric Optimization)
- Uses Nelder-Mead optimization
- Snaps to nearest street nodes
- Slow for large datasets

### New: `/api/graph-route` (Graph-Based Routing)
- Uses A* pathfinding
- Routes along actual streets
- Fast and scalable

## Performance Comparison

| Metric | Geometric | Graph-Based | Improvement |
|--------|-----------|-------------|-------------|
| 2km route | ~3-5 min | ~5-10 sec | 18-60x faster |
| 5km route | ~10-15 min | ~15-30 sec | 20-40x faster |
| 15km route | 24+ min | ~30-60 sec | 24-48x faster |
| Max distance | ~15km | 50km+ | 3x+ larger |

## Quality Comparison

| Aspect | Geometric | Graph-Based |
|--------|-----------|-------------|
| Shape accuracy | Very high | Medium-high |
| Rideability | Not guaranteed | Guaranteed |
| Street following | Approximate | Exact |
| Continuity | Gaps possible | Always continuous |

## Usage

Both endpoints accept the same request format:

\`\`\`json
{
  "location": { "lat": 48.1351, "lng": 11.5820 },
  "radius": 2000,
  "selectedShape": "heart",
  "svgString": null
}
\`\`\`

Both return GeoJSON FeatureCollection with route points.
```

### Success Criteria
- ✅ New API endpoint works correctly
- ✅ Frontend can switch between algorithms
- ✅ All shape types work (heart, circle, star, square)
- ✅ Custom SVG drawings work
- ✅ Results display correctly on map
- ✅ Performance metrics show improvement
- ✅ Both algorithms can be compared side-by-side

### Deliverable
- Working `/api/graph-route` endpoint
- Updated frontend with toggle
- Side-by-side comparison capability
- All shapes tested and working
- Documentation comparing approaches

---

## Phase 6: Testing, Optimization & Polish (Days 14-15)

### Objectives
- Test with complex shapes and custom drawings
- Performance optimization
- Error handling improvements
- Complete documentation
- Migration plan

### Tasks

#### 6.1 Test Complex Custom Drawings

**Manual testing:**
1. Start dev server: `npm run dev`
2. Open http://localhost:3000
3. Use drawing board to create complex shapes:
   - Dog outline (like Strava example)
   - Text/letters
   - Abstract designs
4. Test both algorithms
5. Compare results

**Automated test:**

```javascript
// scripts/test-complex-svg.js
// Test with pre-saved SVG drawings
const dogSVG = fs.readFileSync('test-data/dog.svg', 'utf8')
// ... test routing
```

#### 6.2 Performance Optimizations

**Optimize graph loading:**

```typescript
// lib/graph/builder.ts

// Add node deduplication to reduce graph size
export function deduplicateNodes(graph: Graph, threshold: number = 0.00001): Graph {
  // Merge nodes that are extremely close together
  // Reduces graph size and improves performance
}

// Add graph simplification
export function simplifyGraph(graph: Graph): Graph {
  // Remove degree-2 nodes (passthrough nodes)
  // Keep only intersections and endpoints
  // Can reduce graph size by 30-50%
}
```

**Add route caching:**

```typescript
// lib/graph/router.ts

const routeCache = new Map<string, Route>()
const CACHE_SIZE_LIMIT = 1000

export function findRouteCached(
  graph: Graph,
  startNodeId: string,
  endNodeId: string
): Route | null {
  const cacheKey = `${startNodeId}:${endNodeId}`

  if (routeCache.has(cacheKey)) {
    console.log('Cache hit!')
    return routeCache.get(cacheKey)!
  }

  const route = findRoute(graph, startNodeId, endNodeId)

  if (route) {
    // Add to cache (with size limit)
    if (routeCache.size >= CACHE_SIZE_LIMIT) {
      const firstKey = routeCache.keys().next().value
      routeCache.delete(firstKey)
    }
    routeCache.set(cacheKey, route)
  }

  return route
}
```

#### 6.3 Error Handling & Edge Cases

**Add comprehensive error handling:**

```typescript
// app/api/graph-route/route.ts

export async function POST(request: NextRequest) {
  try {
    // ... existing code

  } catch (error: any) {
    console.error('Graph routing error:', error)

    // Detailed error messages
    if (error.message.includes('No route found')) {
      return NextResponse.json(
        { error: 'Could not create route. Try a different location or smaller radius.' },
        { status: 400 }
      )
    }

    if (error.message.includes('fixture')) {
      return NextResponse.json(
        { error: 'Street data not available. Please ensure fixtures are loaded.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
```

**Test edge cases:**

```javascript
// scripts/test-edge-cases.js
const edgeCases = [
  { name: 'Tiny shape (100m)', radius: 100 },
  { name: 'Huge shape (20km)', radius: 20000 },
  { name: 'Edge of Munich', location: { lat: 48.3, lng: 11.9 } },
  { name: 'Single waypoint', waypointCount: 1 },
  { name: 'Many waypoints', waypointCount: 100 }
]
// Test each case
```

#### 6.4 Complete Documentation

**Create:** `docs/graph-routing-architecture.md`

```markdown
# Graph-Based Routing Architecture

## Overview
This document describes the technical architecture of the graph-based routing system.

## Components

### 1. Graph Builder (`lib/graph/builder.ts`)
Converts GeoJSON street data to queryable graph structure.

**Key Functions:**
- `buildStreetGraph()`: Converts GeoJSON to Graph
- `buildGraphWithIndex()`: Adds spatial index
- `findNearestNode()`: Finds nearest graph node to coordinates

**Performance:**
- Graph building: ~5-10 seconds for Munich
- Spatial index: ~2-3 seconds
- Nearest node query: <1ms

### 2. Router (`lib/graph/router.ts`)
A* pathfinding implementation.

**Algorithm:** Bidirectional A* with haversine heuristic

**Performance:**
- 1km route: ~50-200ms
- 5km route: ~200-500ms
- 10km route: ~500ms-1s

### 3. Waypoint Generator (`lib/graph/shape-to-waypoints.ts`)
Converts shapes to waypoints.

**Adaptive Waypoint Count:**
- Small shapes (<1km): 20 waypoints
- Medium shapes (1-3km): 25-30 waypoints
- Large shapes (3-5km): 35-40 waypoints
- XL shapes (>5km): 45+ waypoints

### 4. Waypoint Router (`lib/graph/waypoint-router.ts`)
Connects waypoints into full route.

**Process:**
1. Route between each consecutive waypoint pair
2. Combine segments (avoiding duplicates)
3. Calculate total distance
4. Return continuous route

## Data Flow

\`\`\`
User Request
    ↓
Frontend (app/page.tsx)
    ↓
API (/api/graph-route)
    ↓
Get Graph (cached)
    ↓
Generate Waypoints
    ↓
Route Between Waypoints (A*)
    ↓
Combine Segments
    ↓
Return GeoJSON
    ↓
Display on Map
\`\`\`

## Caching Strategy

### Memory Cache
- Graph stored in memory after first load
- Persists across requests
- Cleared on server restart

### Disk Cache
- Serialized graph saved to `fixtures/munich-graph.json`
- Loaded on server start if available
- Faster than rebuilding from GeoJSON

### Route Cache
- Recent routes cached in memory
- LRU eviction (1000 routes max)
- Improves performance for repeated queries

## Future Optimizations

1. **Graph Simplification**
   - Remove degree-2 nodes
   - Reduce graph size by 30-50%

2. **Parallel Routing**
   - Route multiple waypoint pairs in parallel
   - Potential 2-4x speedup

3. **Spatial Tiling**
   - Pre-divide graph into tiles
   - Only load relevant tiles
   - Scales to entire countries

4. **Custom Routing Profiles**
   - Prefer cycleways
   - Avoid busy roads
   - Optimize for distance vs safety
```

**Create:** `docs/migration-guide.md`

```markdown
# Migration Guide: Geometric → Graph Routing

## Overview
This guide helps you migrate from the old geometric optimization to the new graph-based routing system.

## Testing Phase (Current)

### Both Algorithms Available
- Use toggle in UI to compare
- Test with various shapes and sizes
- Report any issues

### How to Test
1. Open http://localhost:3000
2. Select "Graph Routing (New)" or "Geometric (Old)"
3. Generate routes
4. Compare:
   - Performance (time)
   - Quality (shape accuracy)
   - Rideability (check on map)

## Rollout Plan

### Week 1: Testing
- [x] Both algorithms available
- [ ] Extensive user testing
- [ ] Collect feedback
- [ ] Fix critical bugs

### Week 2: Default Switch
- [ ] Set graph routing as default
- [ ] Keep old algorithm as fallback
- [ ] Monitor performance
- [ ] Address issues

### Week 3: Deprecation
- [ ] Remove old algorithm
- [ ] Clean up code
- [ ] Update documentation
- [ ] Archive old implementation

## For Developers

### Switching Default Algorithm

In `app/page.tsx`:
\`\`\`typescript
const [useGraphRouting, setUseGraphRouting] = useState(true) // true = graph, false = geometric
\`\`\`

### Removing Old Algorithm

1. Delete `/api/fit-fetch/route.js`
2. Remove toggle from UI
3. Rename `/api/graph-route` to `/api/route`
4. Update all references

## Breaking Changes

None. Both APIs accept the same request/response format.

## Performance Improvements

| Route Size | Old Time | New Time | Improvement |
|------------|----------|----------|-------------|
| 1km | ~2 min | ~5 sec | 24x faster |
| 5km | ~10 min | ~20 sec | 30x faster |
| 15km | 24+ min | ~45 sec | 32x faster |

## Known Limitations

### Graph Routing
- Fixture-based (Munich only currently)
- Medium shape accuracy (vs very high)
- Requires graph building on first load

### Solutions
- Expand to more regions
- Optimize waypoint density for accuracy
- Pre-build and cache graphs

## Support

Questions? Issues? Contact: [your-email]
```

#### 6.5 Final Testing Checklist

**Create:** `docs/testing-checklist.md`

```markdown
# Testing Checklist

## Functional Tests

### Basic Shapes
- [ ] Heart shape (small: 1km)
- [ ] Heart shape (medium: 2km)
- [ ] Heart shape (large: 5km)
- [ ] Circle shape
- [ ] Star shape
- [ ] Square shape

### Custom Drawings
- [ ] Simple custom shape
- [ ] Complex custom shape (dog)
- [ ] Text/letters
- [ ] Very detailed drawing (50+ waypoints)

### Edge Cases
- [ ] Tiny shape (100m radius)
- [ ] Huge shape (15km+ radius)
- [ ] Edge of Munich (boundary testing)
- [ ] Outside Munich (should fail gracefully)

## Performance Tests

### Response Times
- [ ] 1km route: <10 seconds
- [ ] 2km route: <15 seconds
- [ ] 5km route: <30 seconds
- [ ] 10km route: <60 seconds
- [ ] 15km route: <90 seconds

### Resource Usage
- [ ] Memory usage stays <500MB
- [ ] No memory leaks (test 20 consecutive requests)
- [ ] CPU usage is reasonable

## Quality Tests

### Route Accuracy
- [ ] Route follows actual streets
- [ ] No diagonal jumps across blocks
- [ ] Route is continuous (no gaps)
- [ ] Shape is recognizable
- [ ] Routes back to start point

### UI/UX
- [ ] Algorithm toggle works
- [ ] Performance metrics display
- [ ] Error messages are helpful
- [ ] Loading states work correctly
- [ ] Map displays route correctly
- [ ] GPX export works

## Comparison Tests

### Old vs New Algorithm
- [ ] Both produce valid routes
- [ ] Graph routing is faster
- [ ] Quality is comparable
- [ ] Both handle same inputs

## Error Handling

### Expected Errors
- [ ] Invalid location (graceful failure)
- [ ] No fixture available (clear message)
- [ ] Routing failure (retry or alternatives)
- [ ] Network errors (timeout handling)

## Browser Compatibility
- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Mobile browsers

## Deployment Tests

### Production Readiness
- [ ] Environment variables set
- [ ] Fixtures available in production
- [ ] Graph caching works
- [ ] API rate limits (if any)
- [ ] Error monitoring setup
```

### Success Criteria
- ✅ All basic shapes work perfectly
- ✅ Complex custom drawings work
- ✅ 15km+ routes complete successfully
- ✅ Performance targets met
- ✅ Error handling is comprehensive
- ✅ Documentation is complete
- ✅ Testing checklist all passed
- ✅ Ready for production

### Deliverable
- Production-ready system
- Complete documentation
- Testing results
- Migration plan
- Performance benchmarks

---

## Success Metrics

Track these throughout development:

### Performance Targets

| Metric | Old Algorithm | Graph Target | Status |
|--------|--------------|--------------|--------|
| **Build time** | N/A | <10s (first load) | [ ] |
| **1km route** | ~2 min | <10 sec | [ ] |
| **2km route** | ~3-5 min | <15 sec | [ ] |
| **5km route** | ~10 min | <30 sec | [ ] |
| **15km route** | 24+ min | <60 sec | [ ] |
| **Max distance** | ~15km | 50km+ | [ ] |
| **Memory usage** | Variable | <500MB | [ ] |

### Quality Targets

| Metric | Target | Status |
|--------|--------|--------|
| **Shape accuracy** | Medium-High | [ ] |
| **Rideability** | 100% | [ ] |
| **Route continuity** | 100% | [ ] |
| **Waypoint success** | 90%+ | [ ] |
| **Error handling** | Comprehensive | [ ] |

---

## Daily Workflow

### Start of Day
1. Review yesterday's progress
2. Check blockers
3. Plan today's tasks
4. Update TODO list

### During Development
1. Write code incrementally
2. Test frequently
3. Document as you go
4. Commit regularly

### End of Day
1. Review completed tasks
2. Document any blockers
3. Commit and push code
4. Update progress doc

### Daily Standup Template

```markdown
## Day [X] - [Date]

### Completed
- [ ] Task 1
- [ ] Task 2

### In Progress
- [ ] Task 3

### Blocked
- Issue 1 (if any)

### Tomorrow
- Task 4
- Task 5

### Notes
Any important observations or decisions
```

---

## Migration Strategy

### Phase 1: Parallel Running (Week 1-2)
- Both algorithms available
- Toggle in UI for comparison
- Collect metrics and feedback

### Phase 2: Default Switch (Week 3)
- Graph routing becomes default
- Old algorithm remains as fallback
- Monitor performance

### Phase 3: Deprecation (Week 4+)
- Remove old algorithm
- Clean up code
- Archive old implementation

### Rollback Plan
If issues arise:
1. Switch default back to old algorithm
2. Fix issues in graph routing
3. Re-test thoroughly
4. Retry rollout

---

## Quick Reference Commands

```bash
# Setup
git checkout -b graph-routing
npm install graphology graphology-shortest-path

# Development
npm run dev

# Testing
node scripts/analyze-fixture.js
node scripts/test-graph-build.js
node scripts/test-routing.js
node scripts/test-shape-route.js
node scripts/test-all-shapes.js
node scripts/benchmark.js

# Build
npm run build

# Commit
git add .
git commit -m "feat: implement graph-based routing"
git push origin graph-routing
```

---

## Resources

### Libraries
- [graphology](https://graphology.github.io/) - Graph data structure
- [graphology-shortest-path](https://graphology.github.io/standard-library/shortest-path) - A* implementation
- [rbush](https://github.com/mourner/rbush) - Spatial indexing
- [turf.js](https://turfjs.org/) - Geospatial utilities

### References
- [A* Pathfinding Algorithm](https://en.wikipedia.org/wiki/A*_search_algorithm)
- [Haversine Distance](https://en.wikipedia.org/wiki/Haversine_formula)
- [OpenStreetMap Data](https://wiki.openstreetmap.org/wiki/Main_Page)

### Visualization
- [geojson.io](https://geojson.io) - Visualize GeoJSON routes
- [Leaflet.js](https://leafletjs.com/) - Map library (already using)

---

## Support & Questions

### Common Issues

**Q: Graph takes too long to build**
A: First build is slow (~10s). Subsequent loads use cache (<2s).

**Q: Routes don't match shape exactly**
A: Increase waypoint count or adjust waypoint placement.

**Q: Some waypoints don't route**
A: Check if location is within fixture bounds. May need more street data.

**Q: Memory usage is high**
A: Graph simplification can reduce by 30-50%.

### Getting Help

1. Check documentation in `/docs`
2. Review test scripts for examples
3. Check console logs for debugging
4. Review GitHub issues (if applicable)

---

## Conclusion

This plan provides a comprehensive roadmap for implementing graph-based routing. Follow the phases sequentially, test thoroughly at each step, and document progress.

**Estimated Timeline:** 10-15 days
**Expected Result:** 20-40x faster routing with guaranteed rideable routes

Good luck! 🚀
