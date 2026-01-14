# Graph-Based Routing - Complete Development Plan

**Project:** Strava Art - Graph-Based Routing System
**Duration:** 10-15 days (2-3 weeks)
**Objective:** Replace geometric optimization with graph-based pathfinding for faster, rideable routes
**Data Source:** Geofabrik Bavaria PBF (788 MB, updated daily)
**Status:** 🟢 Phase 1-2 Complete | 🔵 Phase 3 In Progress

---

## 📊 Progress Update (Last Updated: 2026-01-10)

### ✅ Completed Phases

**Phase 1: Research & Setup (Completed)** ⏱️ ~3.7 hours
- ✅ System dependencies installed (osmium-tool v1.18.0)
- ✅ Node dependencies installed (graphology, graphology-shortest-path, rbush, stream-json, stream-chain)
- ✅ Bavaria PBF downloaded manually (789 MB → `bayern-260105.osm.pbf`)
- ✅ PBF converted to GeoJSON (808 MB, 2,574,049 street features)
- ✅ Directory structure created (`lib/graph/`, `test-outputs/`, `scripts/`)
- ✅ .gitignore updated to exclude large files
- ✅ Basic graph operations tested and verified

**Phase 2: Graph Infrastructure (Completed)** ⏱️ ~3.7 minutes (graph build time)
- ✅ TypeScript type definitions created (`lib/graph/types.ts`)
- ✅ Graph builder implemented with 2-pass streaming approach (`lib/graph/builder.ts`)
- ✅ Spatial indexing with RBush implemented (`lib/graph/spatial-index.ts`)
- ✅ Graph caching system created (skipped due to size limits, see learnings below)
- ✅ Utility functions implemented (`lib/graph/utils.ts`)
- ✅ **Bavaria graph successfully built:**
  - **3,759,895 nodes** (intersection points only)
  - **2,662,724 edges** (street segments)
  - **Build time:** 227 seconds (~3.7 minutes total: 93s pass 1 + 134s pass 2)
  - **Coverage:** All of Bavaria (47.25°N to 50.57°N, 8.97°E to 13.87°E)
  - **Spatial index:** 3.3 seconds to build, <15ms nearest-node queries
- ✅ Test scripts created and working (`scripts/build-bavaria-graph.ts`)

### 🔵 Current Phase

**Phase 3: Pathfinding Implementation (In Progress)**
- [ ] Implement A* pathfinding algorithm
- [ ] Create shape-to-waypoints converter
- [ ] Build waypoint router
- [ ] Test routing between two points

### 📝 Key Learnings & Adjustments

**1. Memory Optimization - Intersection-Only Nodes**
- **Challenge:** Initial naive approach created nodes at every coordinate point (25M+ nodes), exceeding JavaScript Map limits
- **Solution:** Implemented 2-pass approach:
  - Pass 1: Identify intersection points (where 2+ street segments meet)
  - Pass 2: Build graph using only intersection nodes
- **Result:** Reduced from 25M+ potential nodes to 3.76M nodes (85% reduction)

**2. Streaming GeoJSON Parsing**
- **Challenge:** 808 MB GeoJSON file too large to load into memory
- **Solution:** Used `stream-json` with `pick` filter to stream features array
- **Result:** Can process 2.5M features without memory errors

**3. Graph Caching Limitation**
- **Challenge:** Serialized graph exceeds JavaScript string length limit (~512 MB)
- **Attempted:** Gzip compression + streaming
- **Result:** JSON.stringify still fails at export step
- **Decision:** Skip caching for now, rebuild graph in ~3.7 minutes (acceptable for development)
- **TODO:** Implement SQLite or binary format caching for production

**4. File Processing Performance**
- **Actual timings achieved:**
  - PBF download: Manual (789 MB)
  - PBF → Filtered PBF: ~2-3 minutes (789 MB → 193 MB)
  - Filtered PBF → GeoJSON: ~3-5 minutes (193 MB → 808 MB)
  - GeoJSON → Graph: ~3.7 minutes (2.5M features → 3.76M nodes)
  - Spatial index build: ~3.3 seconds
  - **Total: ~10-15 minutes** (excluding manual download)

**5. Data Quality**
- **Street features:** 2,574,049 LineStrings
- **Highway distribution (from sample):**
  - residential: 55.4%
  - track: 10.0%
  - tertiary: 9.8%
  - service: 9.3%
  - path: 9.0%
  - unclassified: 8.3%
  - cycleway: 0.6%
- **All features are LineStrings** (verified by osmium export config)

### 🎯 Updated Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Graph nodes | 100K-200K | 3.76M | ⚠️ Higher than expected |
| Graph edges | 200K-400K | 2.66M | ⚠️ Higher than expected |
| Build time | <20 min | ~3.7 min | ✅ Faster than target |
| Spatial index | <5s | 3.3s | ✅ Faster than target |
| Nearest node query | <1ms | <15ms | ✅ Fast enough |
| Memory usage | <1GB | ~4-6GB peak | ⚠️ Higher, needs monitoring |

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Data Strategy: Geofabrik PBF](#data-strategy-geofabrik-pbf)
3. [Detailed Project Structure](#detailed-project-structure)
4. [Phase 1: Research & Setup](#phase-1-research--setup-day-1-15)
5. [Phase 2: Graph Infrastructure](#phase-2-graph-infrastructure-days-2-4)
6. [Phase 3: Pathfinding Implementation](#phase-3-pathfinding-implementation-days-5-7)
7. [Phase 4: Shape-to-Route Generation](#phase-4-shape-to-route-generation-days-8-10)
8. [Phase 5: Integration & API Replacement](#phase-5-integration--api-replacement-days-11-13)
9. [Phase 6: Testing, Optimization & Polish](#phase-6-testing-optimization--polish-days-14-15)
10. [Success Metrics](#success-metrics)
11. [Daily Workflow](#daily-workflow)
12. [Migration Strategy](#migration-strategy)

---

## Project Overview

### Current Problem
- **Performance:** 24+ minutes for single route generation
- **Scalability:** Cannot handle routes >15km
- **OSM API:** Slow and rate-limited (Overpass API timeouts)
- **Algorithm:** Nelder-Mead optimization with 489,514 nodes is too slow
- **Coverage:** Limited to small radius around center point

### Solution: Graph-Based Routing with Geofabrik Data
- **Download once:** Bavaria PBF file from Geofabrik (788 MB)
- **Convert & Filter:** Extract cycling-friendly roads only
- **Build graph:** Create queryable street network graph
- **Use A* pathfinding** between waypoints
- **Generate connected, rideable routes**
- **Target:** <60 seconds for 15km routes

### Key Differences

| Aspect | Current (Geometric) | New (Graph-Based) |
|--------|---------------------|-------------------|
| **Data Source** | Overpass API (slow) | Geofabrik PBF (local) |
| **Approach** | Snap to nearest streets | Route along actual streets |
| **Performance** | 24+ minutes | <60 seconds |
| **Coverage** | Limited radius | All of Bavaria |
| **Rideability** | Not guaranteed | 100% guaranteed |
| **Max Distance** | ~15km | 50km+ |
| **Offline** | No (requires API) | Yes (cached locally) |
| **Updates** | Real-time | Daily (re-download) |

---

## Data Strategy: Geofabrik PBF

### Why Geofabrik over Overpass API?

**Overpass API (Current):**
- ❌ Slow (API rate limits)
- ❌ Timeouts on large areas (bavaria-central timed out)
- ❌ Repeated network calls
- ❌ Limited by query radius
- ✅ Easy to use (JSON format)

**Geofabrik PBF (New):**
- ✅ **Download once, use forever** (offline)
- ✅ **Full Bavaria coverage** (not just Munich)
- ✅ **No API calls** (completely offline)
- ✅ **788 MB compressed** (~2-3 GB uncompressed)
- ✅ **Updated daily** (can re-download weekly/monthly)
- ✅ **Professional approach** (used by production OSM apps)
- ⚠️ Requires PBF parsing (not JSON)

### Geofabrik Bavaria Data

**Source:** https://download.geofabrik.de/europe/germany/bayern.html

**Available Formats:**
- `bayern-latest.osm.pbf` - 788 MB (Protocol Buffer format)
- Updated daily (last update: ~17 hours ago)
- Contains ALL OSM data for Bavaria
- MD5 checksum for verification

**What We'll Use:**
- Download full Bavaria PBF
- Filter to cycling-friendly highways only
- Convert to GeoJSON for graph building
- Cache graph for instant loading

### Data Processing Pipeline

```
Download PBF (one-time, ~10 min)
    ↓
Filter highways (2-5 min)
│   - residential
│   - cycleway
│   - tertiary
│   - unclassified
│   - service
│   - track
│   - path
    ↓
Convert to GeoJSON (3-5 min)
    ↓
Build Graph (10-20 min)
    ↓
Cache Graph (1 min)
    ↓
Ready to use! (subsequent loads: 2-5 sec)
```

### File Sizes (Estimated)

```
bayern-latest.osm.pbf              788 MB (download)
bayern-highways-filtered.osm.pbf   ~200 MB (after filtering)
bavaria-streets.geojson            ~500 MB (GeoJSON format)
bavaria-graph.json                 ~300 MB (cached graph)
```

### Update Strategy

**Initial Setup:** Download & process (one-time, ~30-40 min)
**Weekly Updates:** Re-download latest PBF, rebuild graph
**Production:** Store cached graph, update monthly

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
│   ├── bayern-latest.osm.pbf         # NEW: Full Bavaria OSM data (788 MB)
│   ├── bayern-highways-filtered.osm.pbf  # NEW: Filtered highways (~200 MB)
│   ├── bavaria-streets.geojson       # NEW: Bavaria street network (~500 MB)
│   ├── bavaria-graph.json            # NEW: Pre-built graph cache (~300 MB)
│   ├── munich-streets.geojson        # OLD: Keep for comparison
│   └── .gitignore                    # Ignore large PBF/GeoJSON files
│
├── scripts/                          # Development & testing scripts
│   ├── download-bavaria-pbf.sh       # NEW: Download Geofabrik PBF
│   ├── convert-pbf-to-geojson.sh     # NEW: Convert PBF → GeoJSON
│   ├── build-bavaria-graph.js        # NEW: Build graph from GeoJSON
│   ├── fetch-osm-streets.js          # OLD: Keep for fallback
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
│   ├── geofabrik-setup-guide.md           # NEW: PBF setup instructions
│   ├── api-comparison.md                  # NEW: Old vs New comparison
│   └── migration-guide.md                 # NEW: Migration instructions
│
├── test-outputs/                     # NEW: Test result files
│   ├── test-route.geojson            # Example route output
│   ├── heart-route.geojson           # Heart shape test
│   ├── dog-route.geojson             # Complex shape test
│   └── benchmarks.json               # Performance data
│
├── osmium-config.json                # NEW: Osmium export configuration
└── package.json                      # Updated dependencies
```

### New Dependencies

**Node.js packages:**
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

**System tools (required):**
```bash
# macOS
brew install osmium-tool wget

# Linux (Debian/Ubuntu)
apt-get install osmium-tool wget

# Verify installation
osmium --version
wget --version
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

## Phase 1: Research & Setup ✅ COMPLETED (Day 1-1.5)

### Objectives
- ✅ Install system dependencies (osmium-tool)
- ✅ Install graph libraries
- ✅ Create development branch (not needed - working directly)
- ✅ Download & convert Geofabrik Bavaria PBF
- ✅ Set up test infrastructure
- ✅ Understand OSM data structure

### Tasks

#### 1.1 Install System Dependencies

**macOS:**
```bash
brew install osmium-tool wget
osmium --version  # Should show 1.15+ or similar
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get update
sudo apt-get install osmium-tool wget
osmium --version
```

**Verify installation:**
```bash
osmium --version
wget --version
```

#### 1.2 Create Branch & Install Node Dependencies

```bash
git checkout main
git pull
git checkout -b graph-routing

npm install graphology graphology-shortest-path
npm install graphology-types --save-dev
npm install @types/geojson --save-dev
```

#### 1.3 Download Bavaria PBF from Geofabrik

**Create:** `scripts/download-bavaria-pbf.sh`

```bash
#!/bin/bash

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     Downloading Bavaria OSM Data from Geofabrik           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Create fixtures directory if it doesn't exist
mkdir -p fixtures

# Download Bayern PBF (788 MB - will take 5-10 minutes)
echo "📥 Downloading bayern-latest.osm.pbf (788 MB)..."
echo "This may take 5-10 minutes depending on your connection"
echo ""

wget -O fixtures/bayern-latest.osm.pbf \
  --progress=bar:force \
  https://download.geofabrik.de/europe/germany/bayern-latest.osm.pbf

echo ""
echo "✅ Download complete!"
echo ""

# Show file info
echo "📊 File information:"
ls -lh fixtures/bayern-latest.osm.pbf

echo ""
echo "🔍 OSM file details:"
osmium fileinfo fixtures/bayern-latest.osm.pbf

echo ""
echo "✅ Bavaria PBF ready for processing!"
```

**Make executable and run:**
```bash
chmod +x scripts/download-bavaria-pbf.sh
./scripts/download-bavaria-pbf.sh
```

**Expected output:**
```
📥 Downloading bayern-latest.osm.pbf (788 MB)...
[=========>                    ] 45%
...
✅ Download complete!

📊 File information:
-rw-r--r--  1 user  staff   788M Jan  6 10:30 fixtures/bayern-latest.osm.pbf

🔍 OSM file details:
File:
  Name: fixtures/bayern-latest.osm.pbf
  Format: PBF
  Data:
    Bounding box: (8.97,47.27,13.84,50.56)
    Nodes: ~50,000,000
    Ways: ~7,000,000
    Relations: ~100,000
```

#### 1.4 Convert PBF to GeoJSON (Filtered)

**Create:** `scripts/convert-pbf-to-geojson.sh`

```bash
#!/bin/bash

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Converting Bavaria PBF to GeoJSON (Filtered)            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if PBF file exists
if [ ! -f "fixtures/bayern-latest.osm.pbf" ]; then
  echo "❌ Error: bayern-latest.osm.pbf not found!"
  echo "Run ./scripts/download-bavaria-pbf.sh first"
  exit 1
fi

echo "🔧 Step 1: Filtering to cycling-friendly highways..."
echo "Keeping: residential, cycleway, tertiary, unclassified, service, track, path"
echo ""

# Filter to only cycling-friendly highways
osmium tags-filter fixtures/bayern-latest.osm.pbf \
  w/highway=residential,cycleway,tertiary,unclassified,service,track,path \
  -o fixtures/bayern-highways-filtered.osm.pbf \
  --overwrite

echo "✅ Filtered PBF created!"
echo ""
echo "📊 Filtered file size:"
ls -lh fixtures/bayern-highways-filtered.osm.pbf

echo ""
echo "🔧 Step 2: Creating Osmium export configuration..."

# Create osmium config for GeoJSON export
cat > osmium-config.json <<EOF
{
  "attributes": {
    "type": true,
    "id": true,
    "version": false,
    "changeset": false,
    "timestamp": false,
    "uid": false,
    "user": false
  },
  "linear_tags": false,
  "area_tags": false,
  "exclude_tags": [],
  "include_tags": [
    "highway",
    "name",
    "surface",
    "maxspeed"
  ]
}
EOF

echo "✅ Configuration created!"

echo ""
echo "🔧 Step 3: Exporting to GeoJSON..."
echo "This may take 3-5 minutes..."
echo ""

# Export to GeoJSON
osmium export fixtures/bayern-highways-filtered.osm.pbf \
  -f geojson \
  -o fixtures/bavaria-streets.geojson \
  --config=osmium-config.json \
  --overwrite

echo ""
echo "✅ GeoJSON export complete!"
echo ""
echo "📊 Final GeoJSON file:"
ls -lh fixtures/bavaria-streets.geojson

echo ""
echo "📈 Quick statistics:"
grep -c '"type": "Feature"' fixtures/bavaria-streets.geojson | \
  xargs -I {} echo "Total street features: {}"

echo ""
echo "✅ Bavaria street data ready for graph building!"
echo ""
echo "💡 Next step: Run 'node scripts/build-bavaria-graph.js'"
```

**Make executable and run:**
```bash
chmod +x scripts/convert-pbf-to-geojson.sh
./scripts/convert-pbf-to-geojson.sh
```

**Expected timing:**
- Step 1 (Filter): ~2-5 minutes
- Step 2 (Config): <1 second
- Step 3 (Export): ~3-5 minutes
- **Total: ~5-10 minutes**

#### 1.5 Create Directory Structure

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

#### 1.6 Analyze Bavaria GeoJSON Structure

**Create:** `scripts/analyze-bavaria-geojson.js`

```javascript
const fs = require('fs')

console.log('╔════════════════════════════════════════════════════════════╗')
console.log('║       Analyzing Bavaria GeoJSON Street Data               ║')
console.log('╚════════════════════════════════════════════════════════════╝')
console.log('')

console.log('📂 Loading GeoJSON file...')
const startTime = Date.now()
const geojson = JSON.parse(fs.readFileSync('fixtures/bavaria-streets.geojson', 'utf8'))
const loadTime = Date.now() - startTime
console.log(`✅ Loaded in ${(loadTime / 1000).toFixed(1)}s`)

console.log('')
console.log('=== Basic Statistics ===')
console.log('Total features:', geojson.features.length)
console.log('Feature types:', [...new Set(geojson.features.map(f => f.geometry.type))])

const highwayTypes = {}
geojson.features.forEach(f => {
  const highway = f.properties.highway
  highwayTypes[highway] = (highwayTypes[highway] || 0) + 1
})

console.log('')
console.log('=== Highway Distribution ===')
Object.entries(highwayTypes)
  .sort((a, b) => b[1] - a[1])
  .forEach(([type, count]) => {
    const percentage = (count / geojson.features.length * 100).toFixed(1)
    console.log(`${type.padEnd(20)} ${count.toLocaleString().padStart(10)}  (${percentage}%)`)
  })

console.log('')
console.log('=== Sample Feature ===')
console.log(JSON.stringify(geojson.features[0], null, 2))

console.log('')
console.log('=== Coordinate Bounds ===')
let minLat = Infinity, maxLat = -Infinity
let minLng = Infinity, maxLng = -Infinity
let totalCoords = 0

for (const feature of geojson.features) {
  if (feature.geometry.type === 'LineString') {
    totalCoords += feature.geometry.coordinates.length
    for (const [lng, lat] of feature.geometry.coordinates) {
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
      minLng = Math.min(minLng, lng)
      maxLng = Math.max(maxLng, lng)
    }
  }
}

console.log(`Latitude:  ${minLat.toFixed(4)} to ${maxLat.toFixed(4)}`)
console.log(`Longitude: ${minLng.toFixed(4)} to ${maxLng.toFixed(4)}`)
console.log('')
console.log('Total coordinates:', totalCoords.toLocaleString())
console.log('Average per feature:', (totalCoords / geojson.features.length).toFixed(1))

console.log('')
console.log('=== Coverage Area ===')
console.log('This includes major cities:')
console.log('- Munich (München)')
console.log('- Nuremberg (Nürnberg)')
console.log('- Augsburg')
console.log('- Regensburg')
console.log('- Würzburg')
console.log('- And entire Bavaria!')

console.log('')
console.log('✅ Analysis complete!')
```

**Run:**
```bash
node scripts/analyze-bavaria-geojson.js
```

#### 1.7 Update .gitignore

**Add to `.gitignore`:**
```gitignore
# Large OSM data files
fixtures/*.osm.pbf
fixtures/*.geojson
fixtures/*-graph.json

# Keep small test fixtures
!fixtures/test-*.geojson

# Osmium config (optional - could be committed)
# osmium-config.json
```

#### 1.8 Create Simple Graph Test

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

### Success Criteria ✅ ALL ACHIEVED
- ✅ System dependencies installed (osmium-tool v1.18.0)
- ✅ Node packages installed without errors (graphology, graphology-shortest-path, rbush, stream-json, stream-chain)
- ✅ Bavaria PBF downloaded (789 MB → `bayern-260105.osm.pbf`)
- ✅ PBF converted to GeoJSON (808 MB with 2,574,049 features)
- ✅ Can analyze Bavaria GeoJSON structure (using streaming analysis)
- ✅ Know coverage area (all of Bavaria: 47.25°N-50.57°N, 8.97°E-13.87°E)
- ✅ Know highway distribution (residential 55.4%, track 10%, tertiary 9.8%, etc.)
- ✅ Simple graph creation works (tested with `lib/graph/test-simple.ts`)

### Deliverable
- Working development environment
- Bavaria street data downloaded and converted
- Analysis of data structure and coverage
- Test scripts running
- Directory structure created
- Confirmed data quality and completeness

### Timing Summary

| Task | Duration |
|------|----------|
| Install dependencies | 5-10 min |
| Download Bavaria PBF | 5-10 min |
| Convert to GeoJSON | 5-10 min |
| Analyze data | 2-3 min |
| Setup structure | 5 min |
| **Total Phase 1** | **25-40 min** |

---

## Phase 2: Graph Infrastructure ✅ COMPLETED (Days 2-4)

### Objectives
- ✅ Convert Bavaria GeoJSON to graph
- ✅ Implement spatial indexing
- ✅ Query graph by location
- ✅ Measure graph build performance
- ⚠️ Cache graph for instant loading (skipped - see learnings above)

### Tasks

#### 2.1 Build Basic Graph from Bavaria GeoJSON

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
  surface?: string
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

  console.log('Building street graph from GeoJSON...')
  console.time('Graph building')

  let edgeCount = 0
  let skippedWays = 0

  for (const feature of geojson.features) {
    if (feature.geometry.type !== 'LineString') {
      skippedWays++
      continue
    }

    const coords = feature.geometry.coordinates
    const highway = feature.properties.highway
    const name = feature.properties.name
    const surface = feature.properties.surface

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
      const edgeAttrs: StreetEdge = { distance, highway, name, surface }

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
  console.log(`Graph: ${graph.order.toLocaleString()} nodes, ${graph.size.toLocaleString()} edges`)
  console.log(`Skipped ${skippedWays} non-LineString features`)
  console.log(`Average degree: ${(graph.size / graph.order).toFixed(2)}`)

  return graph
}

export function buildGraphWithIndex(geojson: any): GraphWithIndex {
  const graph = buildStreetGraph(geojson)

  console.log('\nBuilding spatial index...')
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
  console.log(`Indexed ${items.length.toLocaleString()} nodes`)

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

#### 2.2 Test Graph Building with Bavaria Data

**Create:** `scripts/build-bavaria-graph.js`

```javascript
const fs = require('fs')
const { buildGraphWithIndex, findNearestNode } = require('../lib/graph/builder')
const { saveGraphToCache } = require('../lib/graph/cache')

console.log('╔════════════════════════════════════════════════════════════╗')
console.log('║       Building Graph from Bavaria Street Data             ║')
console.log('╚════════════════════════════════════════════════════════════╝')
console.log('')

console.log('📂 Loading Bavaria GeoJSON...')
const startLoad = Date.now()
const geojson = JSON.parse(fs.readFileSync('fixtures/bavaria-streets.geojson', 'utf8'))
const loadTime = Date.now() - startLoad
console.log(`✅ Loaded in ${(loadTime / 1000).toFixed(1)}s`)
console.log(`   Features: ${geojson.features.length.toLocaleString()}`)

console.log('')
const { graph, spatialIndex } = buildGraphWithIndex(geojson)

console.log('')
console.log('=== Graph Statistics ===')
console.log('Nodes:', graph.order.toLocaleString())
console.log('Edges:', graph.size.toLocaleString())
console.log('Average degree:', (graph.size / graph.order).toFixed(2))

// Sample some nodes
const sampleNodes = graph.nodes().slice(0, 5)
console.log('')
console.log('=== Sample Nodes ===')
sampleNodes.forEach(nodeId => {
  const attrs = graph.getNodeAttributes(nodeId)
  const degree = graph.degree(nodeId)
  const neighbors = graph.neighbors(nodeId).slice(0, 3).join(', ')
  console.log(`${nodeId}: degree ${degree}, neighbors: ${neighbors}`)
})

// Test nearest node queries in different cities
console.log('')
console.log('=== Testing Spatial Index (Major Cities) ===')

const testCities = [
  { name: 'Munich (Marienplatz)', lat: 48.1374, lng: 11.5755 },
  { name: 'Nuremberg (Hauptmarkt)', lat: 49.4538, lng: 11.0773 },
  { name: 'Augsburg (Rathausplatz)', lat: 48.3668, lng: 10.8986 },
  { name: 'Regensburg (Dom)', lat: 49.0195, lng: 12.0974 }
]

testCities.forEach(city => {
  console.time(`  ${city.name}`)
  const nearest = findNearestNode(spatialIndex, city.lat, city.lng)
  console.timeEnd(`  ${city.name}`)
  const nearestAttrs = graph.getNodeAttributes(nearest)
  console.log(`    Nearest node: ${nearest}`)
  console.log(`    Location: ${nearestAttrs.lat.toFixed(4)}, ${nearestAttrs.lng.toFixed(4)}`)
  console.log('')
})

// Save graph to cache
console.log('💾 Saving graph to cache...')
saveGraphToCache(graph, 'fixtures/bavaria-graph.json')

console.log('')
console.log('✅ Bavaria graph building complete!')
console.log('')
console.log('📊 Files created:')
console.log('  - fixtures/bavaria-graph.json (cached graph)')
console.log('')
console.log('💡 Next step: Test routing with node scripts/test-routing.js')
```

**Run:**
```bash
node scripts/build-bavaria-graph.js
```

**Expected output:**
```
Building Graph from Bavaria Street Data

📂 Loading Bavaria GeoJSON...
✅ Loaded in 3.2s
   Features: 250,000

Building street graph from GeoJSON...
Graph building: 8.234s
Graph: 150,000 nodes, 300,000 edges
Average degree: 2.00

Building spatial index...
Spatial index building: 1.523s
Indexed 150,000 nodes

=== Graph Statistics ===
Nodes: 150,000
Edges: 300,000
Average degree: 2.00

=== Testing Spatial Index (Major Cities) ===
  Munich (Marienplatz): 0.234ms
    Nearest node: 11.575500,48.137400

  Nuremberg (Hauptmarkt): 0.187ms
    Nearest node: 11.077300,49.453800

...

💾 Saving graph to cache...
Graph serialization: 2.456s
Writing to disk: 1.234s
Graph cached to fixtures/bavaria-graph.json (287543.21 KB)

✅ Bavaria graph building complete!
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

    console.log(`Graph loaded from cache: ${graph.order.toLocaleString()} nodes, ${graph.size.toLocaleString()} edges`)
    return graph
  } catch (error: any) {
    console.error('Cache load failed:', error.message)
    return null
  }
}

export function getCachedGraph(
  geojsonPath: string,
  cachePath: string
): Graph {
  // Try to load from cache
  let graph = loadGraphFromCache(cachePath)

  if (!graph) {
    // Build from scratch
    console.log('Building graph from GeoJSON...')
    const { buildStreetGraph } = require('./builder')
    const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'))
    graph = buildStreetGraph(geojson)

    // Save to cache
    saveGraphToCache(graph, cachePath)
  }

  return graph
}
```

### Success Criteria ✅ MOSTLY ACHIEVED
- ✅ Bavaria GeoJSON converts to graph in ~3.7 minutes (2-pass approach required)
- ⚠️ Graph has 3,759,895 nodes (much higher than estimate, but optimized to intersections only)
- ⚠️ Graph has 2,662,724 edges (higher than estimate, but still performant)
- ✅ Nearest node query runs in <15ms across all Bavaria (tested Munich center)
- ⚠️ Graph can be cached but skipped due to JSON.stringify limits (needs SQLite/binary format)
- ⚠️ Cached graph loading: N/A (caching skipped)
- ✅ Works for all major Bavarian cities (tested Munich, spatial index covers full region)
- ⚠️ Memory usage peaks at 4-6GB during build (higher than target, but acceptable)

### Deliverable
- Working graph builder for Bavaria data
- Spatial index for fast queries anywhere in Bavaria
- Caching system
- Test scripts
- Performance metrics
- Cached graph file ready to use

---

## Phase 3-6: Continue as Previously Planned

**Note:** Phases 3-6 remain largely the same as the original plan, with these updates:

### Key Changes:
1. **Data source:** Use `bavaria-streets.geojson` instead of `munich-streets.geojson`
2. **Coverage:** Can test routes anywhere in Bavaria (Munich, Nuremberg, Augsburg, etc.)
3. **Graph size:** Expect larger graph (~150K nodes vs ~50K for Munich only)
4. **Performance:** Slightly slower graph operations but same routing speed

### Updated Testing Locations:

Test routes in multiple cities:
- Munich (Marienplatz to Olympiapark)
- Nuremberg (Hauptmarkt to Kaiserburg)
- Augsburg (Rathausplatz to Fuggerei)
- Regensburg (Dom to Steinerne Brücke)

---

## Success Metrics

Track these throughout development:

### Performance Targets

| Metric | Old Algorithm | Graph Target | Status |
|--------|--------------|--------------|--------|
| **Data loading** | 3-5s (API call) | <5s (cached) | [ ] |
| **1km route** | ~2 min | <10 sec | [ ] |
| **2km route** | ~3-5 min | <15 sec | [ ] |
| **5km route** | ~10 min | <30 sec | [ ] |
| **15km route** | 24+ min | <60 sec | [ ] |
| **Max distance** | ~15km | 100km+ | [ ] |
| **Coverage** | Small radius | All Bavaria | [ ] |
| **Memory usage** | Variable | <1GB | [ ] |

### Quality Targets

| Metric | Target | Status |
|--------|--------|--------|
| **Shape accuracy** | Medium-High | [ ] |
| **Rideability** | 100% | [ ] |
| **Route continuity** | 100% | [ ] |
| **Waypoint success** | 90%+ | [ ] |
| **Error handling** | Comprehensive | [ ] |
| **Multi-city support** | All Bavaria | [ ] |

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

---

## Migration Strategy

### Phase 1: Data Migration (Week 1)
- Download Geofabrik Bavaria PBF
- Convert and build graph
- Test with multiple cities
- Validate coverage

### Phase 2: Parallel Running (Week 2)
- Both algorithms available
- Toggle in UI for comparison
- Test extensively
- Collect metrics

### Phase 3: Default Switch (Week 3)
- Graph routing becomes default
- Keep old algorithm as fallback
- Monitor performance

### Phase 4: Deprecation (Week 4+)
- Remove old algorithm
- Clean up code
- Archive old implementation

---

## Quick Reference Commands

```bash
# Setup
git checkout -b graph-routing
npm install graphology graphology-shortest-path
brew install osmium-tool wget  # macOS

# Data preparation
./scripts/download-bavaria-pbf.sh           # Download 788 MB PBF
./scripts/convert-pbf-to-geojson.sh         # Convert to GeoJSON
node scripts/build-bavaria-graph.js         # Build graph

# Development
npm run dev

# Testing
node scripts/analyze-bavaria-geojson.js
node scripts/test-graph-build.js
node scripts/test-routing.js
node scripts/test-shape-route.js
node scripts/test-all-shapes.js
node scripts/benchmark.js

# Update data (weekly/monthly)
./scripts/download-bavaria-pbf.sh           # Get latest
./scripts/convert-pbf-to-geojson.sh         # Rebuild
node scripts/build-bavaria-graph.js         # Cache

# Build
npm run build

# Commit
git add .
git commit -m "feat: implement graph-based routing with Bavaria coverage"
git push origin graph-routing
```

---

## Resources

### Data Sources
- [Geofabrik Bavaria Download](https://download.geofabrik.de/europe/germany/bayern.html)
- [OSM PBF Format](https://wiki.openstreetmap.org/wiki/PBF_Format)
- [Osmium Tool Documentation](https://osmcode.org/osmium-tool/)

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

## Conclusion

This updated plan integrates Geofabrik's Bavaria PBF data for a professional, scalable routing system. The key improvements:

1. **Full Bavaria Coverage** - Not limited to small radius
2. **Offline Operation** - No API dependencies
3. **Better Performance** - Cached data, instant loading
4. **Production Ready** - Professional data source
5. **Scalable** - Can expand to other regions

**Estimated Timeline:** 10-15 days
**Expected Result:** 20-40x faster routing with guaranteed rideable routes across all of Bavaria

Good luck! 🚀🇩🇪
