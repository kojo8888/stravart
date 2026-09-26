# Stravart Execution Plan

*Created: 2026-09-24*
*Based on: SPEC.md v0.1.0*

---

## Current State

| Aspect | Status |
|--------|--------|
| Branch | `Graph-based-Routing` (9 commits ahead of main) |
| Core routing | Working worldwide via dynamic OSM |
| Quality metrics | Implemented with auto-retry |
| Test coverage | Manual only |
| Shapes | Heart, Star, Circle, Square |
| Production ready | ⚠️ No - see Phase 0 |

---

## Phase 0: Architecture Assessment (BLOCKING)

**Goal:** Understand if current OSM fetching approach is viable before investing in features.

### Current Architecture Concerns

| Issue | Current State | Risk Level |
|-------|---------------|------------|
| API Dependency | Public `overpass-api.de` | ⚠️ No SLA |
| Rate Limiting | None implemented | 🔴 High |
| Cache | In-memory, 5 entries, 30min TTL | 🔴 Not scalable |
| Retry Logic | None | ⚠️ Medium |
| Concurrent Requests | No deduplication | ⚠️ Medium |

### Feasibility by Scale

| Use Case | Feasible? |
|----------|-----------|
| Personal/demo | ✅ Yes |
| < 100 users/day | ✅ Yes |
| 100-1000 users/day | ⚠️ Needs work |
| 1000+ users/day | 🔴 Needs infrastructure |

### Decision Needed

Before proceeding, decide:
1. **Stay small** - Accept current limits, focus on quality
2. **Plan for scale** - Invest in infrastructure (self-hosted Overpass, Redis cache)
3. **Hybrid** - Validate first, defer scaling until needed

---

## Phase 1: Validate Route Quality

**Goal:** Confirm shapes generate rideable, recognizable routes before any cleanup or merge.

### 1.1 Test all shapes at multiple locations
- [ ] Heart: Munich, Paris, New York (small/medium/large)
- [ ] Star: Munich, Paris, New York (small/medium/large)
- [ ] Circle: Munich, Paris, New York (small/medium/large)
- [ ] Square: Munich, Paris, New York (small/medium/large)
- [ ] Document quality metrics for each

### 1.2 Identify specific issues
- [ ] List shapes with > 20% distance error
- [ ] List routes with 0-distance segments (waypoint sticking)
- [ ] List routes with detour ratio > 5x
- [ ] Categorize: fixable vs acceptable vs needs redesign

### 1.3 Visual inspection
- [ ] Load test GeoJSON in geojson.io or similar
- [ ] Verify shapes are recognizable
- [ ] Check routes follow actual streets (not cutting through buildings)

### Checkpoint: Know which shapes work, which need fixing

---

## Phase 2: Fix Critical Issues

**Goal:** Address blocking quality problems identified in Phase 1.

### 2.1 Fix waypoint sticking (0-distance segments)
- [ ] Investigate why some waypoints don't advance
- [ ] Fix snapping or routing logic
- [ ] Verify fix across all shapes

### 2.2 Improve circle quality (currently ~25% error)
- [ ] Analyze why circle has highest error
- [ ] Experiment with waypoint density
- [ ] Experiment with corridor width
- [ ] Target: < 20% error

### 2.3 Heart shape improvements (currently 22% error)
- [ ] Reduce 0-distance segments
- [ ] Improve the "dip" at top of heart routing
- [ ] Target: < 15% error

### Checkpoint: All shapes pass quality thresholds

---

## Phase 3: Merge to Main

**Goal:** Get validated code onto main branch.

### 3.1 Pre-merge checks
- [ ] `npm run build` passes
- [ ] `npm run lint` passes (fix any errors)
- [ ] All shapes validated in Phase 1-2

### 3.2 Merge
- [ ] Create PR or direct merge
- [ ] Update CLAUDE.md (mark legacy APIs)
- [ ] Push to origin

### 3.3 Post-merge
- [ ] Verify deployment works
- [ ] Test one route in production

### Checkpoint: v0.2.0 - Worldwide routing on main

---

## Phase 4: Polish & UX (Future)

- Route preview before generation
- Loading states and progress indicators
- Error messages for common failures
- Mobile-optimized UI

---

## Phase 5: Expand Shapes (Future)

- Triangle
- Pentagon
- Infinity/Figure-8
- Custom SVG upload

---

## Phase 6: Infrastructure (Future, if scaling)

- Self-hosted Overpass or tile cache
- Redis persistent cache
- Rate limiting
- Request queuing
- Retry logic with backoff

---

## Dependency Graph

```
Phase 0 (Architecture Decision)
    │
    ▼
Phase 1 (Validate Quality)
    │
    ├── 1.1 Test all shapes
    ├── 1.2 Identify issues
    └── 1.3 Visual inspection
    │
    ▼
Phase 2 (Fix Critical Issues)  ◄── Only if Phase 1 finds problems
    │
    ├── 2.1 Waypoint sticking
    ├── 2.2 Circle quality
    └── 2.3 Heart quality
    │
    ▼
Phase 3 (Merge)
    │
    ▼
Phase 4+ (Future work)
```

---

## Files to Keep (Do NOT delete prematurely)

| File/Directory | Reason |
|----------------|--------|
| `test-outputs/*.geojson` | Validation artifacts, useful for debugging |
| `fixtures/munich-streets.geojson` | Fallback/comparison baseline |
| `scripts/*` | Testing and debugging utilities |

---

## Open Questions

1. What scale are we targeting? (affects infrastructure decisions)
2. Is 22% distance error acceptable for heart, or must it be lower?
3. Should we add automated tests before or after merge?
