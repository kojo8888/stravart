import { NextResponse } from 'next/server'
import path from 'path'
import { buildGraphFromGeoJSON } from '@/lib/graph/builder'
import { SpatialIndex } from '@/lib/graph/spatial-index'
import { generateWaypointsForShape } from '@/lib/graph/shape-to-waypoints'
import { routeThroughWaypoints, routeToGeoJSON, getRouteStatistics } from '@/lib/graph/waypoint-router'
import type { StreetGraph } from '@/lib/graph/types'

// ========================================
// GRAPH CACHING - Graph is loaded once and kept in memory
// ========================================
let graphCache: StreetGraph | null = null
let spatialIndexCache: SpatialIndex | null = null
let buildPromise: Promise<{ graph: StreetGraph; spatialIndex: SpatialIndex }> | null = null

const GEOJSON_PATH = path.join(process.cwd(), 'fixtures/munich-streets.geojson')

// Munich bounding box (20km radius from city center)
const MUNICH_BOUNDS = {
    minLat: 47.9549,
    maxLat: 48.3153,
    minLng: 11.3120,
    maxLng: 11.8520,
}

// For backwards compatibility
const OBERBAYERN_BOUNDS = MUNICH_BOUNDS

/**
 * Load graph and spatial index (cached after first load)
 */
async function getGraph() {
    // If already loaded, return immediately
    if (graphCache && spatialIndexCache) {
        return { graph: graphCache, spatialIndex: spatialIndexCache }
    }

    // If currently building, wait for it
    if (buildPromise) {
        return await buildPromise
    }

    // Start building
    buildPromise = (async () => {
        console.log('🔧 [GRAPH-ROUTE] Building graph for the first time...')
        const startTime = Date.now()

        try {
            // Build graph from GeoJSON
            const graph = await buildGraphFromGeoJSON(GEOJSON_PATH, {
                mergeThreshold: 20, // 20m node clustering
            })

            // Build spatial index with component filtering
            const spatialIndex = new SpatialIndex(graph, {
                filterToLargestComponent: true,
            })

            const elapsed = (Date.now() - startTime) / 1000
            console.log(`✅ [GRAPH-ROUTE] Graph loaded and ready (${elapsed.toFixed(1)}s)`)
            console.log(`   - Nodes: ${graph.order.toLocaleString()}`)
            console.log(`   - Edges: ${graph.size.toLocaleString()}`)

            // Cache for future requests
            graphCache = graph
            spatialIndexCache = spatialIndex

            return { graph, spatialIndex }
        } catch (error) {
            console.error('❌ [GRAPH-ROUTE] Failed to build graph:', error)
            buildPromise = null // Reset so it can be retried
            throw error
        }
    })()

    return await buildPromise
}

/**
 * Check if location is within Oberbayern region
 */
function isInOberbayern(location: { lat: number; lng: number }): boolean {
    return (
        location.lat >= OBERBAYERN_BOUNDS.minLat &&
        location.lat <= OBERBAYERN_BOUNDS.maxLat &&
        location.lng >= OBERBAYERN_BOUNDS.minLng &&
        location.lng <= OBERBAYERN_BOUNDS.maxLng
    )
}

/**
 * Convert shape name to type for waypoint generation
 */
function getShapeType(shapeName: string): string | null {
    const normalized = shapeName.toLowerCase().trim()
    const shapeMap: Record<string, string> = {
        heart: 'heart',
        circle: 'circle',
        star: 'star',
        square: 'square',
    }
    return shapeMap[normalized] || null
}

/**
 * API Endpoint for Graph-Based Routing
 */
export async function POST(req: Request) {
    try {
        const { location, shape, targetDistanceKm = 5.0 } = await req.json()

        // Validate location
        if (
            !location ||
            typeof location.lat !== 'number' ||
            typeof location.lng !== 'number'
        ) {
            return NextResponse.json(
                { error: 'Invalid location: lat and lng must be numbers' },
                { status: 400 }
            )
        }

        // Check if location is in supported region
        if (!isInOberbayern(location)) {
            return NextResponse.json(
                {
                    error: 'Location outside supported region',
                    message: 'Graph-based routing is currently only available in Munich area (20km radius from city center)',
                    bounds: MUNICH_BOUNDS,
                    yourLocation: location,
                },
                { status: 400 }
            )
        }

        // Validate shape
        const shapeType = getShapeType(shape)
        if (!shapeType) {
            return NextResponse.json(
                {
                    error: 'Unsupported shape',
                    message: `Shape "${shape}" is not supported. Supported shapes: heart, circle, star, square`,
                    supportedShapes: ['heart', 'circle', 'star', 'square'],
                },
                { status: 400 }
            )
        }

        // Validate target distance
        if (targetDistanceKm < 1 || targetDistanceKm > 50) {
            return NextResponse.json(
                {
                    error: 'Invalid target distance',
                    message: 'Target distance must be between 1 and 50 km',
                },
                { status: 400 }
            )
        }

        console.log(
            `🛣️  [GRAPH-ROUTE] Routing ${shapeType} at (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}), target: ${targetDistanceKm}km`
        )

        // Load graph (cached after first request)
        const { graph, spatialIndex } = await getGraph()

        // Calculate radius from target distance
        // For shapes, radius ≈ targetDistance / (2 * π) for circle
        // Use a bit larger to account for shape variations
        const radiusMeters = (targetDistanceKm * 1000) / 5

        // Generate waypoints for the shape
        // Use VERY dense waypoints for better shape accuracy (30-50m spacing)
        // Dense waypoints prevent routing shortcuts across the shape
        const estimatedPerimeter = targetDistanceKm * 1000 // Rough estimate
        const waypointCount = Math.max(50, Math.min(300, Math.ceil(estimatedPerimeter / 40)))

        const waypoints = generateWaypointsForShape(
            shapeType as 'heart' | 'circle' | 'star' | 'square',
            { lat: location.lat, lng: location.lng },
            radiusMeters,
            500, // High point count for smooth shape generation
            waypointCount // Dense waypoints to follow shape curve closely
        )

        console.log(`📍 [GRAPH-ROUTE] Generated ${waypoints.length} waypoints`)

        // Route through waypoints
        const routeStart = Date.now()

        // Calculate maximum segment distance based on waypoint spacing
        // Allow routes up to 2x the expected straight-line distance between waypoints
        const avgWaypointSpacing = (estimatedPerimeter / waypointCount)
        const maxSegmentDistance = avgWaypointSpacing * 2.5 // Allow some flexibility for road network

        console.log(`🛣️  [GRAPH-ROUTE] Max segment distance: ${Math.round(maxSegmentDistance)}m`)

        const route = routeThroughWaypoints(graph, spatialIndex, waypoints, {
            closeLoop: true,
            skipUnreachable: true,
            maxSegmentDistance, // Prevent long detours
        })

        if (!route) {
            return NextResponse.json(
                {
                    error: 'Route generation failed',
                    message: 'Could not find a valid route. Try a different location or smaller distance.',
                },
                { status: 500 }
            )
        }

        const routeTime = Date.now() - routeStart

        // Get route statistics
        const stats = getRouteStatistics(route)

        console.log(
            `✅ [GRAPH-ROUTE] Route created: ${stats.totalDistanceKm}km, ${stats.totalNodes} nodes, ${routeTime}ms`
        )

        // Convert to GeoJSON
        const geojson = routeToGeoJSON(route)

        // Add additional metadata
        const actualDistance = stats.totalDistance / 1000 // Convert to km
        geojson.properties = {
            ...geojson.properties,
            targetDistanceKm,
            actualDistanceKm: parseFloat(stats.totalDistanceKm),
            distanceAccuracy: Math.abs(actualDistance - targetDistanceKm) / targetDistanceKm,
            shape: shapeType,
            center: location,
            waypoints: stats.waypoints,
            segments: stats.segments,
            totalNodes: stats.totalNodes,
            routingTimeMs: routeTime,
            method: 'graph-based',
        } as any

        return NextResponse.json(geojson)
    } catch (err: any) {
        console.error('[GRAPH-ROUTE ERROR]', err)
        return NextResponse.json(
            {
                error: err.message || 'Internal Server Error',
                stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
            },
            { status: 500 }
        )
    }
}

/**
 * GET endpoint for health check and info
 */
export async function GET() {
    const isGraphLoaded = graphCache !== null && spatialIndexCache !== null

    return NextResponse.json({
        service: 'graph-based-routing',
        status: isGraphLoaded ? 'ready' : 'not-loaded',
        supportedRegion: 'Munich, Germany (20km radius)',
        bounds: MUNICH_BOUNDS,
        supportedShapes: ['heart', 'circle', 'star', 'square'],
        distanceRange: '1-50 km',
        graphStats: isGraphLoaded && graphCache
            ? {
                  nodes: graphCache.order,
                  edges: graphCache.size,
              }
            : null,
        info: 'Graph will be loaded on first route request (takes ~10-15s for Munich)',
    })
}
