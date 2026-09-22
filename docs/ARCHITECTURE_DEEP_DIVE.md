# Stravart Architecture Deep Dive & Strategy

A comprehensive analysis of the current implementation, challenges, and proposed solutions.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Core Problem Analysis](#core-problem-analysis)
3. [Challenge 1: Data Fetching Performance](#challenge-1-data-fetching-performance)
4. [Challenge 2: Fitting Logic Issues](#challenge-2-fitting-logic-issues)
5. [Architecture Comparison](#architecture-comparison)
6. [Recommended Strategy](#recommended-strategy)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Quick Wins](#quick-wins)

---

## Executive Summary

### The Goal
Generate rideable routes that trace artistic shapes (hearts, stars, etc.) on real street networks.

### Current Approach
Hybrid system: Nelder-Mead optimization for shape placement + Direction-aware A* for routing.

### Primary Challenges
1. **Data Fetching**: Overpass API queries take 2-8 seconds, making UX poor
2. **Fitting Logic**: Shape optimization doesn't reliably find good placements
3. **Quality Variance**: Results vary wildly based on street network density

### Key Insight
The fundamental tension is between **shape fidelity** (matching the desired shape) and **route feasibility** (streets actually existing where needed). Current implementation over-constrains on shape fidelity, leading to broken routes.

---

## Core Problem Analysis

### What Makes This Hard

```
┌─────────────────────────────────────────────────────────┐
│                    THE CORE TENSION                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   SHAPE FIDELITY          vs         ROUTE FEASIBILITY  │
│   ──────────────                     ─────────────────  │
│   • Exact heart outline              • Streets exist    │
│   • Correct distance                 • Connected graph  │
│   • Proper proportions               • No dead ends     │
│   • Visual aesthetics                • Actually rideable│
│                                                         │
│   Current approach leans too far LEFT                   │
│   Result: Beautiful shapes, broken routes               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Root Causes of Current Issues

**1. Sequential Pipeline is Fragile**
```
Shape → Optimize Position → Generate Waypoints → Route Between
         ↓                    ↓                     ↓
    Can fail here        Or here              Or here

Problem: Each stage assumes previous stage succeeded perfectly.
Reality: Errors compound through the pipeline.
```

**2. Optimization Objective Mismatch**
```
Current objective: minimize distance(shape_point, nearest_street)²
What we actually want: maximize quality_of_routable_path

These are NOT the same thing!
A point can be close to a street but unreachable from other points.
```

**3. Over-Reliance on A* Fallbacks**
```
When A* fails:
  1. Expand corridor (might work)
  2. Expand more (usually fails)
  3. Unconstrained A* (shape is ruined)
  4. Direct connection (route is broken)

The fallback chain treats symptoms, not causes.
```

---

## Challenge 1: Data Fetching Performance

### Current State

```
Request → Overpass API → 2-8 seconds → Parse → Build Graph → 1-2s → Cache
          └───────────────────────────────────────────────────────────┘
                              Total: 3-10 seconds (cold)
```

### Why Overpass is Slow

1. **Query Size**: Fetching all highways for a 5km² area = 50K+ nodes
2. **Server Load**: Public Overpass instances have rate limits
3. **Network Latency**: Round trip to European servers
4. **Parse Overhead**: XML/JSON parsing of large responses

### Option A: Keep Overpass, Optimize Usage

**Strategy: Smarter Caching + Parallel Fetching**

```
Improvements:
├─ Tile-based caching (like map tiles)
│   └─ Split world into fixed grid cells
│   └─ Cache entire cells, not arbitrary bboxes
│   └─ Compose queries from cached cells
│
├─ Pre-fetch popular areas
│   └─ Major cities cached on deploy
│   └─ User's recent areas warm-cached
│
├─ Parallel fetch for large areas
│   └─ Split bbox into 4 quadrants
│   └─ Fetch all simultaneously
│   └─ Merge results
│
└─ Progressive loading
    └─ Return cached portion immediately
    └─ Route on partial data while fetching rest
```

**Pros**:
- Works worldwide immediately
- No infrastructure to maintain
- Incremental improvement path

**Cons**:
- Still dependent on external API
- Fundamental latency floor (~1-2s minimum)
- Can't guarantee availability

### Option B: Pre-Built Regional Datasets

**Strategy: Download OSM data, process offline**

```
Pipeline:
├─ Download OSM PBF files for regions
│   └─ Geofabrik provides daily extracts
│   └─ Example: Germany = 4GB, Munich = 200MB
│
├─ Process with osmium/osmosis
│   └─ Filter to highway types we need
│   └─ Convert to optimized format
│
├─ Store as tiles in object storage (S3/R2)
│   └─ Tile format: z/x/y.graph.msgpack
│   └─ Pre-computed graphs, not raw GeoJSON
│
└─ Serve via CDN edge caching
    └─ Near-instant load (<100ms)
    └─ Works offline if cached
```

**Data Format (Pre-Built Graph)**:
```typescript
interface GraphTile {
  zoom: number;
  x: number;
  y: number;
  nodes: Map<string, {lat, lng, component}>;
  edges: Array<{from, to, distance, highway}>;
  boundaryNodes: Set<string>; // For stitching tiles
}
```

**Pros**:
- Near-instant loading (50-200ms)
- Consistent performance
- No external API dependency
- Works offline

**Cons**:
- Storage costs (~5GB for Europe)
- Update pipeline needed (OSM changes daily)
- Initial coverage limited to processed regions

### Option C: Hybrid Progressive Loading

**Strategy: Best of both worlds**

```
Request Flow:
├─ Check if region has pre-built data
│   ├─ YES: Load instantly from CDN
│   └─ NO: Fetch from Overpass (show loading indicator)
│
├─ Start routing immediately with available data
│   └─ Use coarse graph first (major roads only)
│   └─ Refine as more data loads
│
└─ Cache fetched data for future requests
    └─ Opportunistically build tiles for new areas
```

**Recommended Implementation**:
```typescript
async function getGraph(bbox: BBox): Promise<Graph> {
  // 1. Check pre-built tiles
  const tiles = getTilesForBBox(bbox);
  const cached = await loadCachedTiles(tiles);

  if (cached.coverage > 0.9) {
    return stitchGraphs(cached.graphs);
  }

  // 2. Partial data available - start with that
  if (cached.coverage > 0) {
    const partialGraph = stitchGraphs(cached.graphs);

    // 3. Fetch missing areas in background
    fetchMissing(tiles.missing).then(newGraphs => {
      mergeGraphs(partialGraph, newGraphs);
      cacheTiles(newGraphs);
    });

    return partialGraph; // Return immediately
  }

  // 4. No cached data - full Overpass fetch
  return fetchFromOverpass(bbox);
}
```

### My Recommendation: Start with Option A, Build Toward C

**Phase 1** (1-2 weeks): Optimize Overpass usage
- Implement tile-based caching
- Add retry logic with exponential backoff
- Parallel fetch for large areas

**Phase 2** (2-4 weeks): Add pre-built data
- Process top 50 cities
- Host on Cloudflare R2 or similar
- Fallback to Overpass for uncovered areas

**Phase 3** (ongoing): Progressive loading
- Background tile generation
- Smart prefetching
- Offline support

---

## Challenge 2: Fitting Logic Issues

### Current Problems

**1. Nelder-Mead Optimizes Wrong Objective**

```typescript
// Current cost function
cost = Σ distance(shape_point, nearest_street)²

// Problem: Optimizes proximity, not connectivity
// A shape can be "close" to streets but unroutable
```

**2. Scale Constraint is Too Rigid**

```typescript
// Current: 5% scale deviation = massive penalty (10 million)
if (Math.abs(scale - targetScale) / targetScale > 0.05) {
  return cost + 10000000 * scaleError;
}

// This forces the optimizer to maintain exact distance
// But distance accuracy should be flexible!
// Better to route 28km that looks like a heart
// Than fail to route 25km "exactly"
```

**3. Waypoint Snapping Ignores Connectivity**

```typescript
// Current: snap to nearest node
waypoint = spatialIndex.findNearest(shapePoint);

// Problem: Nearest node might be on an island!
// Should consider: Can we route FROM this node?
```

### Better Fitting Approaches

#### Approach A: Route-Aware Optimization

**Key Insight**: Include routing quality in the optimization objective.

```typescript
function costFunction(params: OptParams): number {
  const shape = transformShape(params);
  const waypoints = generateWaypoints(shape);

  // 1. Snap cost (proximity to streets)
  const snapCost = calculateSnapCost(waypoints, graph);

  // 2. Connectivity cost (can we actually route?)
  const connectivityCost = estimateConnectivity(waypoints, graph);

  // 3. Distance cost (soft penalty, not hard constraint)
  const distanceCost = Math.abs(estimatedDistance - targetDistance);

  // Weighted combination
  return snapCost * 1.0 +
         connectivityCost * 5.0 +  // Heavily weight connectivity
         distanceCost * 0.5;       // Soft distance constraint
}

function estimateConnectivity(waypoints, graph): number {
  let cost = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];

    // Check if path exists within corridor
    if (!pathExistsInCorridor(from, to, graph)) {
      cost += 1000; // Major penalty for disconnected waypoints
    } else {
      // Penalize based on detour factor
      const detour = estimateDetourFactor(from, to, graph);
      cost += detour * 10;
    }
  }
  return cost;
}
```

**Pros**:
- Optimization directly targets what we care about
- Produces routable shapes by design
- Can relax constraints intelligently

**Cons**:
- More expensive (routing checks in cost function)
- Needs efficient connectivity estimation
- May need more iterations

#### Approach B: Iterative Refinement

**Key Insight**: Don't try to optimize everything at once.

```
Phase 1: Coarse Placement
├─ Find approximate center using low-res grid search
├─ 10x10 grid of candidate positions
├─ Quick heuristic: count street density
└─ Pick top 3 candidates

Phase 2: Fine Tuning per Candidate
├─ For each candidate:
│   ├─ Run Nelder-Mead with snap cost only
│   ├─ 50 iterations (fast)
│   └─ Record best position + rotation
│
└─ Keep all 3 refined positions

Phase 3: Route and Score
├─ For each refined position:
│   ├─ Generate waypoints
│   ├─ Route all segments
│   ├─ Calculate quality score
│   └─ If score > threshold: DONE
│
└─ Return best result

Phase 4: Adaptive Relaxation (if needed)
├─ If no result passed quality:
│   ├─ Relax distance constraint by 10%
│   ├─ Retry phase 3
│   └─ Repeat up to 3 times
│
└─ Return best-effort result with warning
```

**Pros**:
- Explores multiple candidates
- Fast failure detection
- Graceful degradation

**Cons**:
- More complex pipeline
- Potentially redundant work
- Still heuristic-based

#### Approach C: Constraint Satisfaction (CSP)

**Key Insight**: Frame as constraint problem, not optimization.

```typescript
// Define constraints (not objectives)
constraints = {
  // Hard constraints
  all_waypoints_on_streets: true,
  all_segments_routable: true,

  // Soft constraints (with priorities)
  distance_within_25_percent: { priority: 1, required: false },
  shape_fidelity_above_80_percent: { priority: 2, required: false },
  max_segment_detour_below_5x: { priority: 3, required: false },
};

// Solver finds any solution satisfying hard constraints
// Then maximizes soft constraint satisfaction
solution = CSPSolver.solve(constraints, graph, shapeType);
```

**Pros**:
- Clear distinction between must-have and nice-to-have
- Provable guarantees (if solution exists)
- Can prove when no solution is possible

**Cons**:
- CSP solvers are complex
- May be overkill for this problem
- Hard to tune constraint priorities

#### Approach D: Template Matching (Simplest)

**Key Insight**: Pre-compute good shape placements for known locations.

```
For popular cities:
├─ Pre-run optimization for each shape type
├─ Store best placements as templates
├─ User requests heart → load Munich heart template
└─ Adjust scale only (keep placement/rotation)

For new locations:
├─ Find nearest city with templates
├─ Use as starting point for optimization
└─ Cache new optimized result as template
```

**Pros**:
- Near-instant for known areas
- Guaranteed good results
- Simple to understand

**Cons**:
- Limited to pre-processed areas
- Storage overhead
- Doesn't adapt to OSM changes

### My Recommendation: Approach B with Elements of A

**Core Strategy**:
1. Use iterative refinement (Approach B) as the framework
2. Include connectivity estimation in cost function (from A)
3. Relax distance constraints early, not as last resort
4. Accept that "pretty close to heart shape" is better than "broken route"

**Specific Changes**:

```typescript
// Change 1: Soft distance constraint
const distancePenalty = (scale - targetScale) / targetScale;
const scaleCost = Math.pow(distancePenalty, 2) * 100; // Quadratic, not step function

// Change 2: Connectivity-aware waypoint snapping
function snapWaypoint(point: Coord, graph: Graph): NodeId {
  const candidates = spatialIndex.findKNearest(point, 10);

  // Filter to nodes in largest connected component
  const connected = candidates.filter(c =>
    isInLargestComponent(c.nodeId, graph)
  );

  // Prefer nodes with degree > 2 (real intersections, not dead ends)
  const intersections = connected.filter(c =>
    graph.degree(c.nodeId) > 2
  );

  return intersections[0]?.nodeId ?? connected[0]?.nodeId;
}

// Change 3: Early exit with good-enough result
function optimize() {
  for (const rotation of [0, 15, -15, 30, -30]) {
    const result = tryWithRotation(rotation);

    if (result.qualityScore > 0.7) { // 70% is "good enough"
      return result;
    }
  }

  // Return best attempt, not failure
  return bestAttempt;
}
```

---

## Architecture Comparison

### Current vs Proposed Architectures

```
┌─────────────────────────────────────────────────────────────────┐
│                     CURRENT ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Request → Fetch OSM → Build Graph → Optimize → Route → Done  │
│              (slow)      (slow)       (fragile)   (falls back) │
│                                                                 │
│   Problems:                                                     │
│   • Linear pipeline, no parallelism                             │
│   • Late failure (after expensive steps)                        │
│   • All-or-nothing quality                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    PROPOSED ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────┐    ┌──────────────┐    ┌───────────────┐          │
│   │ Request │───▶│ Tile Cache   │───▶│ Coarse Grid   │          │
│   └─────────┘    │ (pre-built)  │    │ (find spots)  │          │
│        │         └──────┬───────┘    └───────┬───────┘          │
│        │                │                    │                  │
│        ▼                ▼                    ▼                  │
│   ┌─────────┐    ┌──────────────┐    ┌───────────────┐          │
│   │ Overpass│───▶│ Build Graph  │───▶│ Refine 3x     │          │
│   │(fallback│    │ (if needed)  │    │ (parallel)    │          │
│   └─────────┘    └──────────────┘    └───────┬───────┘          │
│                                              │                  │
│                                              ▼                  │
│                                      ┌───────────────┐          │
│                                      │ Route & Score │          │
│                                      │ (pick best)   │          │
│                                      └───────┬───────┘          │
│                                              │                  │
│                                              ▼                  │
│                                      ┌───────────────┐          │
│                                      │ Return Best   │          │
│                                      │ (with quality)│          │
│                                      └───────────────┘          │
│                                                                 │
│   Improvements:                                                 │
│   • Fast path for cached data                                   │
│   • Parallel candidate evaluation                               │
│   • Early success detection                                     │
│   • Always returns something usable                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Comparison Table

| Aspect | Current | Proposed | Improvement |
|--------|---------|----------|-------------|
| Cold start latency | 5-12s | 1-3s | 4-10x faster |
| Warm cache latency | 0.3-0.5s | 0.1-0.3s | 2x faster |
| Success rate | ~70% | ~95% | More reliable |
| Quality variance | High | Low | Consistent |
| Code complexity | Medium | High | Tradeoff |
| Infrastructure needs | Minimal | CDN + storage | More setup |

---

## Recommended Strategy

### The 80/20 Approach

Focus on fixes that provide maximum impact for minimum effort.

### Priority 1: Fix the Fitting Logic (This Week)

**Changes**:
1. Replace hard scale constraint with soft quadratic penalty
2. Add connectivity check to waypoint snapping
3. Evaluate 3 candidate rotations in parallel, pick best
4. Lower quality threshold to 70% (accept good-enough results)

**Expected Impact**:
- Success rate: 70% → 90%
- Quality consistency: Much better
- Latency: No change (might be slightly slower)

### Priority 2: Optimize A* Routing (This Week)

**Changes**:
1. Replace array.sort() priority queue with binary heap
2. Add early termination when good path found
3. Cache direction calculations per node

**Expected Impact**:
- A* performance: 2-3x faster
- Overall latency: 20-30% reduction

### Priority 3: Implement Tile Caching (Next 2 Weeks)

**Changes**:
1. Define tile grid (zoom 14 = ~600m tiles)
2. Implement tile loading/stitching
3. Add background tile generation for fetched areas
4. Pre-build tiles for top 20 cities

**Expected Impact**:
- Cold start: 5-12s → 1-3s (for cached areas)
- Repeat requests: Near instant

### Priority 4: Progressive Loading (Future)

**Changes**:
1. Return partial results while loading
2. Stream route updates as data arrives
3. Show loading progress to user

**Expected Impact**:
- Perceived latency: Dramatically better
- User experience: Professional feel

---

## Implementation Roadmap

```
Week 1: Critical Fixes
├─ Day 1-2: Soft scale constraint + connectivity snapping
├─ Day 3-4: Priority queue optimization
└─ Day 5: Testing + deployment

Week 2: Tile Caching Foundation
├─ Day 1-2: Define tile format + stitching logic
├─ Day 3-4: Implement cache layer
└─ Day 5: Pre-build Munich + 5 cities

Week 3-4: Expand Coverage
├─ Pre-build top 50 cities
├─ Set up automatic OSM update pipeline
└─ Measure + optimize cache hit rates

Future:
├─ Progressive loading
├─ Custom shape support
└─ Mobile optimization
```

---

## Quick Wins

Changes you can make today that will improve things immediately:

### 1. Lower Quality Threshold
```typescript
// In route.ts, change:
const DEFAULT_THRESHOLDS = {
  maxDistanceError: 0.25,  // → 0.35 (35% is fine for art!)
  maxDetourRatio: 6.0,     // → 8.0 (some detours are OK)
  maxSuspiciousSegments: 2, // → 4 (be more forgiving)
};
```

### 2. Soft Scale Constraint
```typescript
// Replace step function with quadratic
const scaleError = Math.abs(scale - targetScale) / targetScale;
const scaleCost = scaleError * scaleError * 100; // Smooth penalty
```

### 3. Binary Heap Priority Queue
```typescript
// In curve-router.ts, replace PriorityQueue class:
import Heap from 'heap-js'; // npm install heap-js

class PriorityQueue<T> {
  private heap = new Heap<{item: T, priority: number}>(
    (a, b) => a.priority - b.priority
  );

  enqueue(item: T, priority: number) {
    this.heap.push({ item, priority });
  }

  dequeue(): T | undefined {
    return this.heap.pop()?.item;
  }

  isEmpty(): boolean {
    return this.heap.isEmpty();
  }
}
```

### 4. Retry Overpass with Backoff
```typescript
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, {
        timeout: 30000 + i * 15000 // Increase timeout each retry
      });
      if (response.ok) return response;
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

### 5. Parallel Rotation Attempts
```typescript
// Try multiple rotations in parallel, return first success
const rotations = [0, Math.PI/12, -Math.PI/12, Math.PI/6, -Math.PI/6];
const results = await Promise.all(
  rotations.map(r => tryWithRotation(r, params))
);

const passed = results.find(r => r.quality.passed);
return passed ?? results.reduce((best, r) =>
  r.quality.score < best.quality.score ? r : best
);
```

---

## Summary

### The Core Problems
1. **Data fetching is slow** because we query Overpass on every cold request
2. **Fitting fails** because we optimize for proximity instead of routability
3. **Quality varies** because we don't gracefully degrade

### The Solutions
1. **Tile-based caching** with pre-built data for popular areas
2. **Connectivity-aware optimization** that treats routing as first-class
3. **Iterative refinement** with multiple candidates and early success

### The Philosophy
> "A routed 28km heart is better than a failed 25km heart."

Accept flexibility in exact distance. Accept slight shape distortion.
Optimize for **completing routes**, not perfect metrics.

### Next Steps
1. Implement quick wins (today)
2. Add soft constraints + connectivity checks (this week)
3. Build tile caching (next 2 weeks)
4. Iterate based on real-world results

---

*Document generated: April 2026*
*For questions: Review codebase exploration in conversation history*
