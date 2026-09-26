# Stravart Task List

*Last updated: 2026-09-24*

---

## Phase 0: Architecture Decision

- [ ] **DECIDE:** Target scale (personal / small / production)
- [ ] **DECIDE:** Accept current limits or invest in infrastructure

---

## Phase 1: Validate Route Quality

### 1.1 Test shapes - Munich (baseline)
- [ ] Heart 1km - generate and record metrics
- [ ] Heart 5km - generate and record metrics
- [ ] Heart 15km - generate and record metrics
- [ ] Star 1km - generate and record metrics
- [ ] Star 5km - generate and record metrics
- [ ] Star 15km - generate and record metrics
- [ ] Circle 1km - generate and record metrics
- [ ] Circle 5km - generate and record metrics
- [ ] Circle 15km - generate and record metrics
- [ ] Square 1km - generate and record metrics
- [ ] Square 5km - generate and record metrics
- [ ] Square 15km - generate and record metrics

### 1.2 Test shapes - Different location (worldwide validation)
- [ ] Pick a non-European city (e.g., Tokyo, NYC, Sydney)
- [ ] Heart 5km - verify worldwide routing works
- [ ] Star 5km - verify worldwide routing works
- [ ] Document any location-specific issues

### 1.3 Analyze results
- [ ] Create table of all test results
- [ ] Flag shapes with > 20% distance error
- [ ] Flag routes with 0-distance segments
- [ ] Flag routes with detour ratio > 5x

### 1.4 Visual inspection
- [ ] Open each test GeoJSON in geojson.io
- [ ] Screenshot shapes that look wrong
- [ ] Note specific problem areas (e.g., "heart dip routes backward")

---

## Phase 2: Fix Critical Issues

### 2.1 Waypoint sticking (0-distance segments)
- [ ] Add logging to identify where waypoints stick
- [ ] Check if it's snapping or routing issue
- [ ] Implement fix
- [ ] Re-test affected shapes

### 2.2 Circle quality
- [ ] Generate 5 circles at different locations
- [ ] Identify worst-performing segments
- [ ] Try: increase waypoint count for circles
- [ ] Try: widen corridor for circles
- [ ] Pick best fix, verify < 20% error

### 2.3 Heart quality
- [ ] Focus on the "dip" at top center
- [ ] Check if waypoint ordering is correct
- [ ] Verify no backtracking in route
- [ ] Target: < 15% error, no 0-distance segments

---

## Phase 3: Merge to Main

### 3.1 Pre-merge
- [ ] `npm run build` - must pass
- [ ] `npm run lint` - fix any errors
- [ ] Confirm all Phase 1-2 issues resolved or accepted

### 3.2 Merge
- [ ] `git checkout main && git pull`
- [ ] `git merge Graph-based-Routing`
- [ ] Resolve any conflicts
- [ ] `git push`

### 3.3 Post-merge
- [ ] Update CLAUDE.md: mark `/api/shape-route` as deprecated
- [ ] Update STATUS.md
- [ ] Tag as v0.2.0

---

## Progress Summary

| Phase | Tasks | Done | Status |
|-------|-------|------|--------|
| 0. Architecture | 2 | 0 | Not started |
| 1. Validate | 18 | 0 | Not started |
| 2. Fix Issues | 11 | 0 | Blocked by Phase 1 |
| 3. Merge | 7 | 0 | Blocked by Phase 2 |
| **Total** | **38** | **0** | **0%** |

---

## Tomorrow's Starting Point

1. Run `npm run dev` to start dev server
2. Generate test routes via UI or API
3. Begin Phase 1.1 validation
