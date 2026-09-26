# Stravart - Plan

## Current Phase

**Validation** - Testing if shapes generate quality, rideable routes before merge.

## Blocking Decision

Architecture assessment needed:
- Current setup uses public Overpass API (no SLA, rate limits)
- Fine for personal/demo use
- Needs infrastructure work for production scale

## Next Actions

1. [ ] Validate all 4 shapes at multiple scales (Phase 1)
2. [ ] Fix critical quality issues found in validation (Phase 2)
3. [ ] Merge Graph-based-Routing to main (Phase 3)
4. [ ] Polish UX - loading states, previews (Phase 4)

## Known Issues to Investigate

- Heart shape: 22% distance error, multiple 0-distance segments
- Circle shape: ~25% typical error (highest of all shapes)
- Star shape: 5% error - working well

## Backlog

- Add shapes: Triangle, Pentagon, Infinity
- Custom SVG shape upload
- Freehand drawing tool
- Route preview before generation
- Strava API direct upload
- Mobile-optimized UI
- Production infrastructure (self-hosted Overpass, Redis cache)

## Detailed Plan

See `tasks/plan.md` for full execution plan.
See `tasks/todo.md` for granular task checklist.
