# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server on localhost:3000
- `npm run build` - Build production version
- `npm run start` - Start production server
- `npm run lint` - Run ESLint linting

## Project Architecture

Strava Art is a Next.js 15 application that generates bike routes shaped like drawings by fitting them to real street networks using mathematical optimization.

### Core Components

**Frontend (`app/page.tsx`)**
- Main interface with city/location selection, shape input, and interactive map
- Uses React 19 with TypeScript, Tailwind CSS, and Radix UI components
- Supports three input methods: predefined cities, geolocation, or place search via Nominatim
- Custom drawing board component for SVG shape creation
- Dynamic map component using Leaflet (client-side only due to SSR requirements)

**API Layer (`app/api/fit-fetch/route.js`)**
- Single endpoint handling shape fitting requests
- Fetches street network data from Overpass Turbo API (OpenStreetMap)
- Processes two types of shapes:
  - Predefined mathematical shapes (currently only 'heart' implemented)
  - Custom SVG drawings from the drawing board
- Uses Nelder-Mead optimization algorithm to fit shapes to street nodes
- Returns GeoJSON FeatureCollection of points snapped to nearest streets

**Key Libraries**
- **Spatial indexing**: RBush with k-nearest neighbor search for efficient street node matching
- **Map rendering**: react-leaflet with Leaflet.js (dynamically imported to avoid SSR issues)
- **HTTP requests**: Axios for frontend API calls
- **Optimization**: Custom Nelder-Mead implementation for shape fitting
- **SVG parsing**: Custom path/polyline parser for user drawings

### Shape Processing Pipeline

1. **Input**: Location coordinates + shape description/SVG
2. **Street data**: Fetch local street network (highways: primary, secondary, tertiary, residential, cycleway) within specified radius
3. **Shape generation**: Either mathematical generation (heart) or SVG path parsing
4. **Normalization**: Scale and center shape coordinates
5. **Optimization**: Use Nelder-Mead to find best fit (scale, rotation, translation) that minimizes distance to street nodes
6. **Snapping**: Snap each optimized point to nearest actual street node using spatial index
7. **Output**: GeoJSON of street-snapped points forming the desired shape

### Drawing Board Feature

Located in `components/DrawingBoard.tsx` - allows users to draw custom shapes that get converted to SVG paths, then processed through the same optimization pipeline as predefined shapes.

### Environment Requirements

- Node.js environment with Next.js 15
- No external API keys required (uses public Overpass Turbo and Nominatim APIs)
- Client-side geolocation API for user location detection

### File Structure Notes

- Uses TypeScript with custom type definitions in `app/types/`
- Tailwind CSS with custom configuration
- Component library uses Radix UI primitives with custom styling
- Public assets include map tiles and icons for Leaflet integration