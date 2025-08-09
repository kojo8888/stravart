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
- Premium access system with free tier (2 routes) and paid tier (unlimited routes)

**API Layer (`app/api/fit-fetch/route.js`)**
- Single endpoint handling shape fitting requests
- Fetches street network data from Overpass Turbo API (OpenStreetMap)
- Processes two types of shapes:
  - Predefined mathematical shapes (heart, circle, star, square via `lib/shapes/`)
  - Custom SVG drawings from the drawing board
- Uses Nelder-Mead optimization algorithm to fit shapes to street nodes
- Returns GeoJSON FeatureCollection of points snapped to nearest streets

**Shape Library (`lib/shapes/`)**
- Modular shape system with TypeScript definitions
- Individual shape generators: `heart.ts`, `circle.ts`, `star.ts`, `square.ts`
- Central registry and utilities in `index.ts`
- Type definitions in `types.ts` for consistent shape interfaces
- Shape normalization and point generation functions

**Key Libraries**
- **Spatial indexing**: RBush with k-nearest neighbor search for efficient street node matching
- **Map rendering**: react-leaflet with Leaflet.js (dynamically imported to avoid SSR issues)
- **HTTP requests**: Axios for frontend API calls
- **Optimization**: fmin library for Nelder-Mead algorithm implementation
- **Geospatial**: Turf.js for distance calculations and nearest point operations
- **SVG parsing**: Custom path/polyline parser for user drawings
- **UI Components**: Radix UI primitives with Lucide React icons

### Shape Processing Pipeline

1. **Input**: Location coordinates + shape description/SVG
2. **Street data**: Fetch local street network (highways: primary, secondary, tertiary, residential, cycleway) within specified radius
3. **Shape generation**: Either mathematical generation (heart) or SVG path parsing
4. **Normalization**: Scale and center shape coordinates
5. **Optimization**: Use Nelder-Mead to find best fit (scale, rotation, translation) that minimizes distance to street nodes
6. **Snapping**: Snap each optimized point to nearest actual street node using spatial index
7. **Output**: GeoJSON of street-snapped points forming the desired shape

### Core Components Detail

**Drawing Board (`components/DrawingBoard.tsx`)**
- Interactive SVG drawing canvas for custom shape creation
- Converts user drawings to SVG paths for processing through optimization pipeline
- Supports freehand drawing with real-time path generation

**Map Component (`components/GeoMap.tsx`)**
- Client-side Leaflet integration using react-leaflet
- Handles GeoJSON rendering with custom styling for route visualization
- Marker management and popup functionality

**UI Components (`components/ui/`)**
- Radix UI-based component library with custom styling
- Includes: `button.tsx`, `input.tsx`, `progress.tsx`, `select.tsx`
- Consistent design system using Tailwind CSS and class-variance-authority

### Environment Requirements

- Node.js environment with Next.js 15
- No external API keys required (uses public Overpass Turbo and Nominatim APIs)
- Client-side geolocation API for user location detection

### File Structure

```
stravart/
├── app/                          # Next.js 15 App Router
│   ├── api/fit-fetch/route.js   # Main API endpoint for shape fitting
│   ├── globals.css              # Global styles and Tailwind imports
│   ├── layout.tsx               # Root layout component
│   ├── page.tsx                 # Main application page
│   └── types/
│       └── geokdbush.d.ts       # Type definitions for geokdbush library
├── components/                   # React components
│   ├── DrawingBoard.tsx         # Interactive SVG drawing component
│   ├── GeoMap.tsx              # Leaflet map integration component
│   └── ui/                     # Radix UI-based component library
│       ├── button.tsx
│       ├── input.tsx
│       ├── progress.tsx
│       └── select.tsx
├── lib/                         # Utility libraries and business logic
│   ├── shapes/                  # Shape generation system
│   │   ├── circle.ts           # Circle shape generator
│   │   ├── heart.ts            # Heart shape generator
│   │   ├── index.ts            # Shape registry and utilities
│   │   ├── square.ts           # Square shape generator
│   │   ├── star.ts             # Star shape generator
│   │   └── types.ts            # Shape type definitions
│   └── utils.ts                # General utilities (cn function, etc.)
├── public/                      # Static assets
│   ├── bavaria_bike_nodes.geojson # Sample geospatial data
│   ├── *.png                   # Leaflet map icons and markers
│   └── *.svg                   # UI icons and assets
├── styles/                      # Legacy CSS modules (if used)
└── Configuration files:
    ├── components.json          # Radix UI/shadcn configuration
    ├── next.config.ts          # Next.js configuration
    ├── tailwind.config.js      # Tailwind CSS configuration
    ├── tsconfig.json           # TypeScript configuration
    ├── eslint.config.mjs       # ESLint configuration
    └── prettier.config.js      # Prettier configuration
```

### Technology Stack

- **Framework**: Next.js 15 with React 19 and TypeScript
- **Styling**: Tailwind CSS v4 with PostCSS
- **UI Library**: Radix UI primitives with custom styling
- **Maps**: Leaflet.js with react-leaflet integration
- **Geospatial**: Turf.js for spatial calculations
- **Optimization**: fmin library for mathematical optimization
- **Spatial Indexing**: RBush with k-nearest neighbor search
- **Code Quality**: ESLint, Prettier, TypeScript strict mode