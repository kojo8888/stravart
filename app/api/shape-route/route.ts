/**
 * Shape Route API - Generates rideable routes that follow shape outlines
 *
 * This endpoint uses the curve-following router to create continuous routes
 * that actually look like the target shape (heart, circle, star, square).
 *
 * Key difference from /api/graph-route:
 * - Uses corridor-constrained routing (only routes through streets near shape)
 * - Uses direction-aware A* (penalizes paths that deviate from shape curve)
 * - Result is a continuous rideable route that resembles the target shape
 */

import { NextResponse } from 'next/server'
import path from 'path'
import { buildGraphFromGeoJSON } from '@/lib/graph/builder'
import { SpatialIndex } from '@/lib/graph/spatial-index'
import { generateWaypointsForShape } from '@/lib/graph/shape-to-waypoints'
import {
    routeShapeWithCurveFollowing,
    segmentsToGeoJSON
} from '@/lib/graph/curve-router'
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
        console.log('🔧 [SHAPE-ROUTE] Building graph for the first time...')
        const startTime = Date.now()

        try {
            // Build graph from GeoJSON
            const graph = await buildGraphFromGeoJSON(GEOJSON_PATH, {
                mergeThreshold: 5, // 5m node clustering for better accuracy
            })

            // Build spatial index with component filtering
            const spatialIndex = new SpatialIndex(graph, {
                filterToLargestComponent: true,
            })

            const elapsed = (Date.now() - startTime) / 1000
            console.log(`✅ [SHAPE-ROUTE] Graph loaded and ready (${elapsed.toFixed(1)}s)`)
            console.log(`   - Nodes: ${graph.order.toLocaleString()}`)
            console.log(`   - Edges: ${graph.size.toLocaleString()}`)

            // Cache for future requests
            graphCache = graph
            spatialIndexCache = spatialIndex

            return { graph, spatialIndex }
        } catch (error) {
            console.error('❌ [SHAPE-ROUTE] Failed to build graph:', error)
            buildPromise = null // Reset so it can be retried
            throw error
        }
    })()

    return await buildPromise
}

/**
 * Check if location is within Munich region
 */
function isInMunich(location: { lat: number; lng: number }): boolean {
    return (
        location.lat >= MUNICH_BOUNDS.minLat &&
        location.lat <= MUNICH_BOUNDS.maxLat &&
        location.lng >= MUNICH_BOUNDS.minLng &&
        location.lng <= MUNICH_BOUNDS.maxLng
    )
}

/**
 * Get shape type from name
 */
function getShapeType(shapeName: string): 'heart' | 'circle' | 'star' | 'square' | null {
    const normalized = shapeName.toLowerCase().trim()
    const validShapes = ['heart', 'circle', 'star', 'square'] as const
    return validShapes.includes(normalized as any) ? (normalized as any) : null
}

/**
 * Calculate optimal radius based on target distance and shape type
 *
 * Key insight from testing:
 * - 1500m radius heart → 12.35km route (ratio: 8.23)
 * - This is the "route distance to radius" ratio
 *
 * For good shape quality, we enforce a minimum radius to ensure
 * the corridor has enough streets to route through.
 */
function calculateRadius(targetDistanceKm: number, shapeType: string): number {
    // Empirically measured: route distance / radius ratio
    // From curve-router-test: 12.35km / 1500m = 8.23 km per 1000m radius
    const routeToRadiusRatios: Record<string, number> = {
        circle: 6.5,   // Circle routes are more efficient
        heart: 8.2,    // Heart: 12.35km / 1.5km = 8.23
        star: 7.0,     // Star has sharp points
        square: 5.5,   // Square aligns with grid
    }

    // Minimum radius for good shape quality
    // Below this, the corridor becomes too narrow and shapes degrade
    const minRadiusMeters: Record<string, number> = {
        circle: 400,
        heart: 800,    // Hearts need larger radius due to tight curves
        star: 600,
        square: 400,
    }

    const ratio = routeToRadiusRatios[shapeType] || 8.0
    const minRadius = minRadiusMeters[shapeType] || 600

    // Calculate ideal radius from target distance
    const idealRadiusMeters = (targetDistanceKm / ratio) * 1000

    // Enforce minimum radius for shape quality
    return Math.max(idealRadiusMeters, minRadius)
}

/**
 * API Endpoint for Shape-Based Routing
 */
export async function POST(req: Request) {
    try {
        const body = await req.json()
        const {
            location,
            shape,
            targetDistanceKm = 5.0,
            corridorWidthRatio = 0.20,  // Corridor as fraction of radius (20%)
            directionPenalty = 0.6,     // Default 0.6 direction penalty (higher = stricter)
            waypointCount = 40,         // Default 40 waypoints
        } = body

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
        if (!isInMunich(location)) {
            return NextResponse.json(
                {
                    error: 'Location outside supported region',
                    message: 'Shape routing is currently only available in Munich area',
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
                    message: `Shape "${shape}" is not supported`,
                    supportedShapes: ['heart', 'circle', 'star', 'square'],
                },
                { status: 400 }
            )
        }

        // Validate target distance
        if (targetDistanceKm < 1 || targetDistanceKm > 30) {
            return NextResponse.json(
                {
                    error: 'Invalid target distance',
                    message: 'Target distance must be between 1 and 30 km',
                },
                { status: 400 }
            )
        }

        // Calculate radius from target distance
        const radiusMeters = calculateRadius(targetDistanceKm, shapeType)

        // Calculate corridor width as fraction of radius (default 20%)
        // This ensures corridor doesn't overlap with itself on tight curves
        const corridorWidth = Math.round(radiusMeters * corridorWidthRatio)

        console.log(
            `🎨 [SHAPE-ROUTE] Creating ${shapeType} at (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`
        )
        console.log(`   Target: ${targetDistanceKm}km, Radius: ${radiusMeters.toFixed(0)}m, Corridor: ${corridorWidth}m, Penalty: ${directionPenalty}`)

        // Load graph (cached after first request)
        const graphStart = Date.now()
        const { graph, spatialIndex } = await getGraph()
        const graphTime = Date.now() - graphStart

        // Generate dense shape points for corridor and direction calculation
        const shapePoints = generateWaypointsForShape(
            shapeType,
            { lat: location.lat, lng: location.lng },
            radiusMeters,
            200  // Dense points for accurate corridor/direction
        ).map(wp => ({ lat: wp.lat, lng: wp.lng }))

        // Generate sparser waypoints for actual routing
        const waypoints = generateWaypointsForShape(
            shapeType,
            { lat: location.lat, lng: location.lng },
            radiusMeters,
            100,
            waypointCount
        ).map(wp => ({ lat: wp.lat, lng: wp.lng }))

        console.log(`   Generated ${waypoints.length} waypoints, ${shapePoints.length} shape points`)

        // Route using curve-following algorithm
        const routeStart = Date.now()

        const segments = routeShapeWithCurveFollowing(
            graph,
            waypoints,
            shapePoints,
            (coord) => spatialIndex.findNearest(coord),
            {
                corridorWidth,
                directionPenalty,
                closeLoop: true,
            }
        )

        const routeTime = Date.now() - routeStart

        if (!segments || segments.length === 0) {
            return NextResponse.json(
                {
                    error: 'Route generation failed',
                    message: 'Could not create a route. Try a different location or smaller distance.',
                    debug: {
                        location,
                        shape: shapeType,
                        radiusMeters,
                        corridorWidth,
                    }
                },
                { status: 500 }
            )
        }

        // Convert to GeoJSON
        const geojson = segmentsToGeoJSON(segments)

        // Calculate actual distance
        const actualDistanceKm = parseFloat(geojson.properties.totalDistanceKm)
        const distanceError = Math.abs(actualDistanceKm - targetDistanceKm) / targetDistanceKm

        // Add metadata
        const result = {
            ...geojson,
            properties: {
                ...geojson.properties,
                shape: shapeType,
                center: location,
                targetDistanceKm,
                actualDistanceKm,
                distanceError: `${(distanceError * 100).toFixed(1)}%`,
                radiusMeters: Math.round(radiusMeters),
                corridorWidth,
                directionPenalty,
                waypointCount: waypoints.length,
                graphLoadTimeMs: graphTime,
                routingTimeMs: routeTime,
                method: 'curve-following',
            }
        }

        console.log(
            `✅ [SHAPE-ROUTE] Complete: ${actualDistanceKm.toFixed(2)}km (${(distanceError * 100).toFixed(1)}% error), ${routeTime}ms`
        )

        return NextResponse.json(result)

    } catch (err: any) {
        console.error('[SHAPE-ROUTE ERROR]', err)
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
        service: 'shape-route',
        description: 'Curve-following router for Strava Art shapes',
        status: isGraphLoaded ? 'ready' : 'not-loaded',
        supportedRegion: 'Munich, Germany (20km radius)',
        bounds: MUNICH_BOUNDS,
        supportedShapes: ['heart', 'circle', 'star', 'square'],
        parameters: {
            location: { type: 'object', required: true, example: { lat: 48.1351, lng: 11.5820 } },
            shape: { type: 'string', required: true, example: 'heart' },
            targetDistanceKm: { type: 'number', default: 5, range: '1-30' },
            corridorWidth: { type: 'number', default: 250, description: 'Width of routing corridor in meters' },
            directionPenalty: { type: 'number', default: 0.5, range: '0-1', description: 'Penalty for deviating from shape direction' },
            waypointCount: { type: 'number', default: 40, description: 'Number of waypoints around the shape' },
        },
        graphStats: isGraphLoaded && graphCache
            ? {
                nodes: graphCache.order,
                edges: graphCache.size,
            }
            : null,
        info: 'Graph will be loaded on first request (takes ~15-20s)',
        example: {
            method: 'POST',
            body: {
                location: { lat: 48.1351, lng: 11.5820 },
                shape: 'heart',
                targetDistanceKm: 5,
            }
        }
    })
}
