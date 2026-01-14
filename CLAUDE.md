# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server on localhost:3000
- `npm run build` - Build production version
- `npm run start` - Start production server
- `npm run lint` - Run ESLint linting

## Project Architecture

Strava Art is a Next.js 15 application that generates bike routes shaped like drawings by fitting them to real street networks.

**Current Status:** The application currently uses geometric optimization (Nelder-Mead) with the Overpass API. A new **graph-based routing system** is in development (Phase 3) that will replace this with A* pathfinding for 20-40x performance improvement.

### Routing Algorithms (Two Approaches)

**Current: Geometric Optimization (Legacy)**
- Uses Nelder-Mead algorithm to fit shapes to street nodes
- Fetches data from Overpass Turbo API (slow, rate-limited)
- Takes 24+ minutes for single route, limited to 15km routes
- Located in `app/api/fit-fetch/route.js`

**New: Graph-Based Routing (In Development - Phase 3)**
- Uses A* pathfinding on pre-built street network graph
- Offline Bavaria street data from Geofabrik (2.5M street features)
- Target: <60 seconds for 15km routes (20-40x faster)
- Located in `lib/graph/`
- See `/docs/graph-routing-development-plan.md` for details

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
- Includes GPX export functionality for GPS device compatibility

**Shape Library (`lib/shapes/`)**
- Modular shape system with TypeScript definitions
- Individual shape generators: `heart.ts`, `circle.ts`, `star.ts`, `square.ts`
- Central registry and utilities in `index.ts`
- Type definitions in `types.ts` for consistent shape interfaces
- Shape normalization and point generation functions

**Key Libraries**

*Current (Geometric Optimization):*
- **Spatial indexing**: RBush with k-nearest neighbor search for efficient street node matching
- **Optimization**: fmin library for Nelder-Mead algorithm implementation
- **HTTP requests**: Axios for Overpass API calls

*New (Graph-Based Routing):*
- **Graph structure**: graphology for graph data structures
- **Pathfinding**: graphology-shortest-path for A* algorithm
- **Spatial indexing**: RBush for fast nearest-node queries (O(log n))
- **Streaming**: stream-json for processing large GeoJSON files
- **OSM data**: Geofabrik Bavaria PBF (2.5M street features, 808 MB)

*Shared:*
- **Map rendering**: react-leaflet with Leaflet.js (dynamically imported to avoid SSR issues)
- **Geospatial**: Turf.js for distance calculations and nearest point operations
- **SVG parsing**: Custom path/polyline parser for user drawings
- **UI Components**: Radix UI primitives with Lucide React icons
- **Payment Processing**: Stripe integration for premium subscriptions

### Shape Processing Pipeline

1. **Input**: Location coordinates + shape description/SVG
2. **Street data**: Fetch local street network (highways: primary, secondary, tertiary, residential, cycleway) within specified radius
3. **Shape generation**: Either mathematical generation (heart) or SVG path parsing
4. **Normalization**: Scale and center shape coordinates
5. **Optimization**: Use Nelder-Mead to find best fit (scale, rotation, translation) that minimizes distance to street nodes
6. **Snapping**: Snap each optimized point to nearest actual street node using spatial index
7. **Output**: GeoJSON of street-snapped points forming the desired shape
8. **Export**: Optional GPX conversion for GPS devices and cycling computers

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

**Cookie Consent System (`components/CookieConsent.tsx`)**
- GDPR-compliant cookie consent banner
- localStorage-based consent tracking
- Granular consent options for essential and analytics cookies
- Dedicated cookie policy page at `/cookies`

**Payment System (`components/CheckoutButton.js` & Stripe APIs)**
- Stripe integration for premium subscriptions (€5.99/month for unlimited routes)
- Free tier: 2 route generations, premium tier: unlimited
- Payment state management in `lib/payment.ts` with localStorage persistence
- Checkout flow: Stripe Checkout → Success page → 30 days premium access
- API endpoints: `/api/stripe/checkout` (create session), `/api/stripe/webhook` (handle events)
- Success page: `/success` handles post-payment flow and stores premium access

### Environment Requirements

- Node.js environment with Next.js 15
- External APIs: Public Overpass Turbo and Nominatim APIs (no keys required)
- Stripe API keys required for payment processing (see .env setup below)
- Client-side geolocation API for user location detection

### Environment Variables (.env)

```bash
# Stripe Configuration
STRIPE_SECRET_KEY="sk_live_..." # Stripe secret key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..." # Stripe publishable key  
STRIPE_WEBHOOK_SECRET="whsec_..." # Webhook secret from Stripe dashboard

# Optional APIs
OPENAI_API_KEY="sk-proj-..." # If using AI features
```

### File Structure

```
stravart/
├── app/                          # Next.js 15 App Router
│   ├── api/
│   │   ├── fit-fetch/route.js   # Main API endpoint for shape fitting
│   │   └── stripe/              # Stripe payment API endpoints
│   │       ├── checkout/route.js # Create Stripe checkout session
│   │       └── webhook/route.js # Handle Stripe webhook events
│   ├── cookies/page.tsx         # Cookie policy page
│   ├── success/page.tsx         # Payment success page
│   ├── globals.css              # Global styles and Tailwind imports
│   ├── layout.tsx               # Root layout component
│   ├── page.tsx                 # Main application page
│   └── types/
│       └── geokdbush.d.ts       # Type definitions for geokdbush library
├── components/                   # React components
│   ├── CheckoutButton.js        # Stripe payment button component
│   ├── CookieConsent.tsx        # GDPR cookie consent banner
│   ├── DrawingBoard.tsx         # Interactive SVG drawing component
│   ├── GeoMap.tsx              # Leaflet map integration component
│   └── ui/                     # Radix UI-based component library
│       ├── button.tsx
│       ├── input.tsx
│       ├── progress.tsx
│       └── select.tsx
├── lib/                         # Utility libraries and business logic
│   ├── graph/                   # NEW: Graph-based routing system (Phase 3)
│   │   ├── types.ts            # Type definitions for graph routing
│   │   ├── builder.ts          # GeoJSON → Graph conversion (2-pass streaming)
│   │   ├── spatial-index.ts    # RBush spatial indexing for fast queries
│   │   ├── cache.ts            # Graph caching utilities (currently skipped)
│   │   ├── utils.ts            # Helper functions (haversine, etc.)
│   │   ├── router.ts           # TODO: A* pathfinding implementation
│   │   ├── shape-to-waypoints.ts  # TODO: Shape → Waypoints conversion
│   │   ├── waypoint-router.ts  # TODO: Connect waypoints into routes
│   │   └── test-simple.ts      # Simple graph test
│   ├── shapes/                  # Shape generation system
│   │   ├── circle.ts           # Circle shape generator
│   │   ├── heart.ts            # Heart shape generator
│   │   ├── index.ts            # Shape registry and utilities
│   │   ├── square.ts           # Square shape generator
│   │   ├── star.ts             # Star shape generator
│   │   └── types.ts            # Shape type definitions
│   ├── payment.ts              # Payment state management utilities
│   └── utils.ts                # General utilities (cn function, etc.)
├── public/                      # Static assets
│   ├── bavaria_bike_nodes.geojson # Sample geospatial data
│   ├── *.png                   # Leaflet map icons and markers
│   └── *.svg                   # UI icons and assets
├── fixtures/                    # NEW: OSM street data (gitignored)
│   ├── bayern-260105.osm.pbf   # Bavaria OSM data (789 MB, gitignored)
│   ├── bayern-highways-filtered.osm.pbf  # Filtered cycling roads (193 MB)
│   ├── bavaria-streets.geojson # Converted street data (808 MB, 2.5M features)
│   └── .gitkeep                # Keep directory in git
├── scripts/                     # NEW: Data processing & testing scripts
│   ├── convert-pbf-to-geojson.sh  # Convert PBF → GeoJSON
│   ├── build-bavaria-graph.ts  # Build graph from GeoJSON
│   └── analyze-bavaria-geojson.js  # Analyze GeoJSON structure
├── docs/                        # Documentation
│   └── graph-routing-development-plan.md  # Graph routing implementation plan
├── test-outputs/                # NEW: Test results directory
├── styles/                      # Legacy CSS modules (if used)
├── osmium-config.json           # NEW: Osmium export configuration
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
- **Optimization (Legacy)**: fmin library for Nelder-Mead algorithm
- **Graph Routing (New)**: graphology, graphology-shortest-path, RBush
- **Data Processing**: osmium-tool, stream-json, stream-chain
- **Spatial Indexing**: RBush with k-nearest neighbor search
- **Payment Processing**: Stripe with @stripe/stripe-js for frontend integration
- **Code Quality**: ESLint, Prettier, TypeScript strict mode

### Graph Routing System (In Development)

**Overview:**
The new graph-based routing system uses A* pathfinding on a pre-built street network graph of Bavaria, replacing the slow geometric optimization approach.

**Data Pipeline:**
1. **Source:** Geofabrik Bavaria PBF (789 MB, updated daily)
2. **Filter:** Extract cycling-friendly roads using osmium-tool (→ 193 MB)
3. **Convert:** Export to GeoJSON format (→ 808 MB, 2.5M street features)
4. **Build Graph:** 2-pass streaming approach creates graph (→ 3.76M nodes, 2.66M edges)
5. **Index:** Build RBush spatial index for O(log n) nearest-node queries

**Graph Statistics:**
- **Nodes:** 3,759,895 (intersection points only)
- **Edges:** 2,662,724 (street segments)
- **Coverage:** All of Bavaria (47.25°N-50.57°N, 8.97°E-13.87°E)
- **Build Time:** ~3.7 minutes
- **Spatial Index:** 3.3 seconds to build, <15ms queries

**Key Optimizations:**
- **Intersection-only nodes:** Reduced from 25M+ to 3.76M nodes by only creating nodes where streets meet
- **Streaming GeoJSON parsing:** Processes 808 MB file without loading into memory
- **2-pass approach:** Pass 1 finds intersections, Pass 2 builds graph
- **Spatial indexing:** Fast nearest-node lookups across entire Bavaria

**Current Limitations:**
- Graph caching skipped (JSON.stringify fails on large graph)
- Rebuilds graph in ~3.7 minutes each time (acceptable for development)
- Memory usage peaks at 4-6GB during build
- TODO: Implement SQLite or binary format caching for production

**Development Commands:**
```bash
# Build graph from GeoJSON (takes ~3.7 minutes)
NODE_OPTIONS="--max-old-space-size=8192" npx tsx scripts/build-bavaria-graph.ts

# Convert PBF to GeoJSON (one-time setup)
./scripts/convert-pbf-to-geojson.sh

# Analyze GeoJSON structure
node scripts/analyze-bavaria-geojson.js
```

### Payment System Details

**Flow:**
1. Free users get 2 route generations
2. After limit: Premium upgrade prompt (€5.99)
3. Stripe Checkout → Success page → 30 days unlimited access
4. Premium status stored in localStorage with expiration

**Components:**
- `CheckoutButton`: Stripe integration with UI styling
- `lib/payment.ts`: Access checking, remaining days calculation
- Route count tracking in localStorage
- Visual premium status indicators in main UI

**API Endpoints:**
- `POST /api/stripe/checkout`: Creates Stripe checkout session
- `POST /api/stripe/webhook`: Handles payment completion events
- Success redirect: `/success?session_id={SESSION_ID}`

### Recent Features

**GPX Export (`app/page.tsx:173-200`)**
- Convert generated routes to GPX format for GPS devices
- Includes route metadata (name, description, timestamp)
- Compatible with cycling computers and navigation apps
- Automatic filename generation based on shape and timestamp

**GDPR Compliance (`components/CookieConsent.tsx`)**
- Cookie consent banner with accept/decline options
- Granular consent for essential vs analytics cookies
- Consent state persistence in localStorage
- Dedicated cookie policy page with detailed explanations

## Design & Style Guide

### UX Guidelines
1. 🎨 **Always use Tailwind CSS** - No custom CSS, use utility classes
2. 🧩 **Always use shadcn/ui components** - Consistent, accessible components
3. ⚪ **Light design** - Clean, minimal, airy layouts with plenty of white space
4. 🎯 **Minimal colors** - Use very few colors (primarily neutral grays + 1-2 accent colors)
5. ✨ **Modern aesthetic** - Clean typography, subtle shadows, smooth animations
6. 📱 **Mobile-first** - Always design for mobile, then scale up

### Design Principles
- **Less is more**: Remove unnecessary elements
- **Typography hierarchy**: Use font sizes to create clear hierarchy
- **Generous spacing**: Use padding/margin liberally (p-6, p-8, gap-4)
- **Subtle effects**: Use hover states, transitions, and minimal shadows
- **Accessibility**: Ensure good contrast, keyboard navigation, semantic HTML

## Core Rules & Constraints

### Development Rules
1. ❌ **Never push directly to `main`** - Use feature branches
2. 🔒 **Use environment variables** - Never hardcode secrets
3. **Use Context 7 MCP as a mcpServer for programming documentation