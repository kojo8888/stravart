# Stravart Execution Plan

*Created: 2026-09-24*
*Updated: 2026-09-26*
*Based on: SPEC.md v0.1.0*

---

## Current State

| Aspect | Status |
|--------|--------|
| Branch | `Graph-based-Routing` (ahead of main) |
| Core routing | Working worldwide via dynamic OSM |
| Quality metrics | Implemented with auto-retry |
| Overpass API | 5 endpoints with retry logic |
| Backtracking | Prevention implemented |
| Test coverage | Manual only |
| Shapes | Heart, Star, Circle, Square |
| Production ready | Needs validation |

---

## Recent Fixes (2026-09-26)

### Overpass API Reliability
- **Problem:** Single endpoint failing with 406/429 errors
- **Solution:**
  - Added 5 fallback endpoints
  - Retry logic with 2s/4s delays
  - 30s timeout per request
  - Rate-limit detection (429) with backoff

### Backtracking Prevention
- **Problem:** Routes went down dead-end streets and returned
- **Solution:**
  - Dead-end detection (`isDeadEndNode` - degree <= 1)
  - Avoid snapping waypoints to dead-ends
  - Post-processing to remove backtracking (detect repeated nodes)

### Geolocation
- **Problem:** "Use My Location" silently failing
- **Solution:** Secure context check + detailed error messages

---

## Phase 0: Architecture Assessment

**Status:** Partially addressed - API reliability improved

### Current Architecture

| Issue | Previous State | Current State |
|-------|---------------|---------------|
| API Dependency | Single endpoint | 5 endpoints with fallback |
| Rate Limiting | None | Retry with backoff |
| Cache | In-memory, 5 entries | Same (acceptable for now) |
| Retry Logic | None | 3 attempts with delays |
| Timeout | None | 30s per request |

### Feasibility by Scale

| Use Case | Feasible? |
|----------|-----------|
| Personal/demo | Yes |
| < 100 users/day | Yes |
| 100-1000 users/day | Needs monitoring |
| 1000+ users/day | Needs infrastructure |

---

## Phase 1: Validate Route Quality

**Goal:** Confirm shapes generate rideable, recognizable routes.

### 1.1 Test all shapes at multiple locations
- [ ] Heart: Munich (1km, 5km, 15km)
- [ ] Star: Munich (1km, 5km, 15km)
- [ ] Circle: Munich (1km, 5km, 15km)
- [ ] Square: Munich (1km, 5km, 15km)
- [ ] One shape at non-European location

### 1.2 Verify backtracking fixes
- [ ] Generate routes and check for detours
- [ ] Verify dead-end avoidance logging appears
- [ ] Verify backtracking removal logging appears

### 1.3 Visual inspection
- [ ] Load test GeoJSON in geojson.io
- [ ] Verify shapes are recognizable
- [ ] Check routes follow actual streets

### Checkpoint: Know which shapes work, which need more work

---

## Phase 2: Fix Remaining Issues

**Goal:** Address quality problems found in Phase 1.

### 2.1 Waypoint issues - PARTIALLY DONE
- [x] Dead-end avoidance implemented
- [x] Backtracking removal implemented
- [ ] Verify fixes work across all shapes

### 2.2 Circle quality (currently ~25% error)
- [ ] Analyze why circle has highest error
- [ ] Experiment with waypoint density
- [ ] Target: < 20% error

### 2.3 Heart quality (currently ~22% error)
- [ ] Reduce distance error
- [ ] Verify heart "dip" routes correctly
- [ ] Target: < 15% error

### Checkpoint: All shapes pass quality thresholds

---

## Phase 3: Merge to Main

**Goal:** Get validated code onto main branch.

### 3.1 Pre-merge checks
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] All shapes validated

### 3.2 Merge
- [ ] Create PR or direct merge
- [ ] Update CLAUDE.md
- [ ] Push to origin

### 3.3 Post-merge
- [ ] Verify deployment works
- [ ] Test one route in production
- [ ] Tag as v0.2.0

---

## Phase 4+ (Future)

- Route preview before generation
- Loading states and progress indicators
- More shapes (triangle, pentagon, figure-8)
- Custom SVG upload improvements
- Self-hosted Overpass (if scaling needed)

---

## Key Files Changed (2026-09-26)

| File | Changes |
|------|---------|
| `lib/graph/osm-fetcher.ts` | Multiple endpoints, retry logic, timeouts |
| `lib/graph/curve-router.ts` | Dead-end avoidance, backtracking removal |
| `app/api/optimized-route/route.ts` | Pass `findKNearestNodes` to router |
| `app/page.tsx` | Geolocation secure context check |

---

## Open Questions

1. Is current API reliability sufficient for launch?
2. What's the acceptable distance error threshold per shape?
3. Should we add automated tests before or after merge?
