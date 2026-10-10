# Stravart Status

**Phase:** Validation
**Last:** Fixed Overpass API reliability + backtracking prevention
**Next:** Test all shapes at multiple scales to validate quality
**Blocked:** Nothing

## Quick Context

- Branch: `Graph-based-Routing` (ahead of main)
- Build: Passes
- Shapes working: Star (~5% error), Heart (~15-22% error), Circle (~25% error), Square (~12% error)
- Architecture: Using multiple public Overpass API endpoints with retry logic

## Recent Changes (2026-09-26)

### Overpass API Reliability
- Added 5 fallback endpoints (kumi, lz4, z, main, mail.ru)
- Implemented retry logic with delays (up to 3 attempts)
- Added timeout handling (30s per request)
- Better rate-limit handling (429 detection with backoff)

### Backtracking Prevention
- Dead-end node avoidance during waypoint snapping
- Post-processing to detect and remove backtracking segments
- Routes now avoid going down streets and returning

### Geolocation Fix
- Added secure context check (HTTPS/localhost required)
- Better error messages for permission denied, unavailable, timeout
