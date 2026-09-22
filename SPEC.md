# Stravart - Art Route Generator Specification

## Vision

Stravart generates rideable bike and run routes shaped like drawings (hearts, stars, custom shapes) using real street networks. Unlike simple drawing tools, it creates routes that athletes can actually ride by fitting shapes to OpenStreetMap street data and connecting waypoints with smart routing.

## Core Features

### Shape Generation
- **Predefined Shapes:** Heart, Star, Circle, Square
- **Custom Shapes:** Upload SVG or draw freehand
- **Shape Fitting:** Nelder-Mead optimization to fit shapes to street networks

### Worldwide Routing
- **Dynamic OSM Data:** Fetches road data via Overpass API for any location
- **Graph Building:** Creates routing graph from intersections
- **A* Pathfinding:** Direction-aware routing with corridor constraints
- **Quality Assessment:** Auto-retry with rotation variations if quality fails

### Route Output
- **GeoJSON Export:** Connected LineString segments
- **GPX Export:** Compatible with Strava, Garmin, etc.
- **Quality Metrics:** Distance error, detour ratio, connectivity stats

### Premium Features
- Stripe subscription for advanced features
- Higher quality routes
- Custom shape uploads

## Tech Stack

- **Framework:** Next.js 15, React 19, TypeScript
- **Styling:** Tailwind CSS v4, Radix UI
- **Maps:** Leaflet.js, react-leaflet
- **Graph:** graphology, graphology-shortest-path
- **Spatial:** RBush, Turf.js, geokdbush
- **Optimization:** fmin (Nelder-Mead)
- **Data:** OpenStreetMap via Overpass API
- **Payments:** Stripe

## Revenue Model

- **Freemium:** Basic shapes free, premium for custom shapes
- **Subscription:** Monthly/yearly for unlimited routes
- **One-time:** Pay per custom route generation

## Current State

- Worldwide routing working via dynamic OSM fetching
- Graph-based routing branch active
- Quality metrics and auto-retry implemented
- First request 3-8s, cached requests 0.3-0.5s
- Production-ready, early version (v0.1.0)
