/**
 * Optimized Route API - Hybrid approach combining:
 * 1. Nelder-Mead optimization to find best shape placement (position, scale, rotation)
 * 2. Graph-based A* routing to create connected, rideable routes
 *
 * This combines the best of both worlds:
 * - Optimization ensures waypoints land near actual streets
 * - A* routing creates a continuous, rideable path
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
import { haversineDistance } from '@/lib/graph/utils'
import type { StreetGraph } from '@/lib/graph/types'

// ========================================
// GRAPH CACHING
// ========================================
let graphCache: StreetGraph | null = null
let spatialIndexCache: SpatialIndex | null = null
let buildPromise: Promise<{ graph: StreetGraph; spatialIndex: SpatialIndex }> | null = null

const GEOJSON_PATH = path.join(process.cwd(), 'fixtures/munich-streets.geojson')

// Munich bounding box
const MUNICH_BOUNDS = {
    minLat: 47.9549,
    maxLat: 48.3153,
    minLng: 11.3120,
    maxLng: 11.8520,
}

// ========================================
// NELDER-MEAD OPTIMIZER
// ========================================

interface OptimizationParams {
    scale: number
    rotation: number
    translateLng: number
    translateLat: number
}

/**
 * Transform shape points using optimization parameters
 */
function transformShapePoints(
    normalizedPoints: Array<{ x: number; y: number }>,
    params: OptimizationParams,
    centerLat: number
): Array<{ lat: number; lng: number }> {
    const { scale, rotation, translateLng, translateLat } = params
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)

    // Convert meters to degrees (approximate)
    const metersPerDegreeLat = 111320
    const metersPerDegreeLng = 40075000 * Math.cos((centerLat * Math.PI) / 180) / 360

    return normalizedPoints.map(p => {
        // Rotate
        const rotatedX = p.x * cos - p.y * sin
        const rotatedY = p.x * sin + p.y * cos

        // Scale (convert from normalized units to meters, then to degrees)
        const scaledLat = (rotatedY * scale) / metersPerDegreeLat
        const scaledLng = (rotatedX * scale) / metersPerDegreeLng

        // Translate
        return {
            lat: translateLat + scaledLat,
            lng: translateLng + scaledLng
        }
    })
}

/**
 * Calculate cost: sum of squared distances from shape points to nearest street nodes
 * Plus penalty for deviating from target scale
 */
function calculateCost(
    params: OptimizationParams,
    normalizedPoints: Array<{ x: number; y: number }>,
    spatialIndex: SpatialIndex,
    centerLat: number,
    targetScale: number
): number {
    const transformed = transformShapePoints(normalizedPoints, params, centerLat)

    // Cost 1: Distance to nearest street nodes
    let snapCost = 0
    for (const point of transformed) {
        const nearest = spatialIndex.findNearest(point)
        if (nearest) {
            // Cost is squared distance in meters
            snapCost += nearest.distance * nearest.distance
        } else {
            // Heavy penalty if no node found
            snapCost += 1000000
        }
    }

    // Cost 2: FIXED SCALE - only optimize rotation and translation
    // Penalize any deviation from target scale very heavily
    const scaleError = Math.abs(params.scale - targetScale) / targetScale
    if (scaleError > 0.05) {
        // More than 5% scale deviation - heavy penalty
        return snapCost + scaleError * 10000000
    }

    return snapCost
}

/**
 * Nelder-Mead simplex optimization
 */
function nelderMead(
    costFn: (params: number[]) => number,
    initialParams: number[],
    maxIterations: number = 150
): { params: number[]; cost: number } {
    const alpha = 1.0  // Reflection
    const gamma = 2.0  // Expansion
    const rho = 0.5    // Contraction
    const sigma = 0.5  // Shrink

    const n = initialParams.length

    // Initial simplex: start point + n perturbed points
    // Keep scale perturbation small to stay near target distance
    const perturbations = [
        200,    // scale: 200m (small to stay near target)
        0.3,    // rotation: ~17 degrees (allow more rotation exploration)
        0.008,  // translateLng: ~800m
        0.008   // translateLat: ~800m
    ]

    let simplex: number[][] = [initialParams.slice()]
    for (let i = 0; i < n; i++) {
        const point = initialParams.slice()
        point[i] += perturbations[i]
        simplex.push(point)
    }

    // Evaluate all points
    let costs = simplex.map(p => costFn(p))

    for (let iter = 0; iter < maxIterations; iter++) {
        // Sort by cost
        const indices = costs.map((_, i) => i).sort((a, b) => costs[a] - costs[b])
        simplex = indices.map(i => simplex[i])
        costs = indices.map(i => costs[i])

        // Centroid of all points except worst
        const centroid = new Array(n).fill(0)
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                centroid[j] += simplex[i][j] / n
            }
        }

        const worst = simplex[n]
        const worstCost = costs[n]

        // Reflection
        const reflected = centroid.map((c, i) => c + alpha * (c - worst[i]))
        const reflectedCost = costFn(reflected)

        if (reflectedCost < costs[n - 1] && reflectedCost >= costs[0]) {
            // Accept reflection
            simplex[n] = reflected
            costs[n] = reflectedCost
            continue
        }

        if (reflectedCost < costs[0]) {
            // Try expansion
            const expanded = centroid.map((c, i) => c + gamma * (reflected[i] - c))
            const expandedCost = costFn(expanded)

            if (expandedCost < reflectedCost) {
                simplex[n] = expanded
                costs[n] = expandedCost
            } else {
                simplex[n] = reflected
                costs[n] = reflectedCost
            }
            continue
        }

        // Contraction
        const contracted = centroid.map((c, i) => c + rho * (worst[i] - c))
        const contractedCost = costFn(contracted)

        if (contractedCost < worstCost) {
            simplex[n] = contracted
            costs[n] = contractedCost
            continue
        }

        // Shrink
        for (let i = 1; i <= n; i++) {
            simplex[i] = simplex[0].map((v, j) => v + sigma * (simplex[i][j] - v))
            costs[i] = costFn(simplex[i])
        }
    }

    // Return best
    const bestIdx = costs.indexOf(Math.min(...costs))
    return { params: simplex[bestIdx], cost: costs[bestIdx] }
}

/**
 * Generate normalized shape points (centered at origin, unit scale)
 */
function generateNormalizedShapePoints(
    shapeType: 'heart' | 'circle' | 'star' | 'square',
    numPoints: number = 60
): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = []

    for (let i = 0; i < numPoints; i++) {
        const t = (i / numPoints) * 2 * Math.PI

        let x: number, y: number

        switch (shapeType) {
            case 'heart':
                // Heart parametric equation (scaled to ~unit size)
                x = 16 * Math.pow(Math.sin(t), 3)
                y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
                // Normalize to roughly -1 to 1 range
                x /= 16
                y /= 16
                break

            case 'circle':
                x = Math.cos(t)
                y = Math.sin(t)
                break

            case 'star':
                // 5-pointed star
                const starPoints = 5
                const outerRadius = 1
                const innerRadius = 0.4
                const angle = (i / numPoints) * 2 * Math.PI - Math.PI / 2
                const pointIndex = Math.floor((i / numPoints) * starPoints * 2)
                const radius = pointIndex % 2 === 0 ? outerRadius : innerRadius
                const starAngle = (pointIndex / (starPoints * 2)) * 2 * Math.PI - Math.PI / 2
                x = radius * Math.cos(starAngle)
                y = radius * Math.sin(starAngle)
                break

            case 'square':
                // Square with rounded progress
                const side = Math.floor((i / numPoints) * 4)
                const progress = ((i / numPoints) * 4) % 1
                switch (side) {
                    case 0: x = -1 + 2 * progress; y = 1; break
                    case 1: x = 1; y = 1 - 2 * progress; break
                    case 2: x = 1 - 2 * progress; y = -1; break
                    default: x = -1; y = -1 + 2 * progress; break
                }
                break

            default:
                x = Math.cos(t)
                y = Math.sin(t)
        }

        points.push({ x, y })
    }

    return points
}

// ========================================
// GRAPH LOADING
// ========================================

async function getGraph() {
    if (graphCache && spatialIndexCache) {
        return { graph: graphCache, spatialIndex: spatialIndexCache }
    }

    if (buildPromise) {
        return await buildPromise
    }

    buildPromise = (async () => {
        console.log('🔧 [OPTIMIZED-ROUTE] Building graph...')
        const startTime = Date.now()

        const graph = await buildGraphFromGeoJSON(GEOJSON_PATH, {
            mergeThreshold: 5,
        })

        const spatialIndex = new SpatialIndex(graph, {
            filterToLargestComponent: true,
        })

        const elapsed = (Date.now() - startTime) / 1000
        console.log(`✅ [OPTIMIZED-ROUTE] Graph ready (${elapsed.toFixed(1)}s)`)

        graphCache = graph
        spatialIndexCache = spatialIndex

        return { graph, spatialIndex }
    })()

    return await buildPromise
}

function isInMunich(location: { lat: number; lng: number }): boolean {
    return (
        location.lat >= MUNICH_BOUNDS.minLat &&
        location.lat <= MUNICH_BOUNDS.maxLat &&
        location.lng >= MUNICH_BOUNDS.minLng &&
        location.lng <= MUNICH_BOUNDS.maxLng
    )
}

function getShapeType(shapeName: string): 'heart' | 'circle' | 'star' | 'square' | null {
    const normalized = shapeName.toLowerCase().trim()
    const validShapes = ['heart', 'circle', 'star', 'square'] as const
    return validShapes.includes(normalized as any) ? (normalized as any) : null
}

/**
 * Calculate radius from target distance based on shape type
 */
function calculateRadius(targetDistanceKm: number, shapeType: string): number {
    const routeToRadiusRatios: Record<string, number> = {
        circle: 19.5,
        heart: 10.5,
        star: 15.0,
        square: 18.5,
    }

    const minRadiusMeters: Record<string, number> = {
        circle: 400,
        heart: 800,
        star: 600,
        square: 400,
    }

    const ratio = routeToRadiusRatios[shapeType] || 8.0
    const minRadius = minRadiusMeters[shapeType] || 600
    const idealRadiusMeters = (targetDistanceKm / ratio) * 1000

    return Math.max(idealRadiusMeters, minRadius)
}

// ========================================
// API ENDPOINT
// ========================================

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const {
            location,
            shape,
            targetDistanceKm = 5.0,
            waypointCount = 40,
        } = body

        // Validate location
        if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
            return NextResponse.json(
                { error: 'Invalid location: lat and lng must be numbers' },
                { status: 400 }
            )
        }

        if (!isInMunich(location)) {
            return NextResponse.json(
                { error: 'Location outside supported region (Munich area)' },
                { status: 400 }
            )
        }

        const shapeType = getShapeType(shape)
        if (!shapeType) {
            return NextResponse.json(
                { error: `Unsupported shape: ${shape}`, supportedShapes: ['heart', 'circle', 'star', 'square'] },
                { status: 400 }
            )
        }

        if (targetDistanceKm < 1 || targetDistanceKm > 60) {
            return NextResponse.json(
                { error: 'Target distance must be between 1 and 60 km' },
                { status: 400 }
            )
        }

        console.log(`🎯 [OPTIMIZED-ROUTE] Creating ${shapeType} at (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`)
        console.log(`   Target: ${targetDistanceKm}km`)

        // Load graph
        const graphStart = Date.now()
        const { graph, spatialIndex } = await getGraph()
        const graphTime = Date.now() - graphStart

        // Calculate initial radius estimate
        const initialRadius = calculateRadius(targetDistanceKm, shapeType)
        console.log(`   Initial radius estimate: ${initialRadius.toFixed(0)}m`)

        // ========================================
        // PHASE 1: OPTIMIZE SHAPE PLACEMENT
        // ========================================
        console.log('🔍 Phase 1: Optimizing shape placement...')
        const optimizeStart = Date.now()

        // Generate normalized shape points for optimization
        const normalizedPoints = generateNormalizedShapePoints(shapeType, 60)

        // Initial parameters: [scale, rotation, translateLng, translateLat]
        const initialParams = [
            initialRadius,  // scale in meters
            0,              // rotation in radians
            location.lng,   // center lng
            location.lat    // center lat
        ]

        // Cost function wrapper (includes scale penalty to maintain target distance)
        const costFn = (params: number[]) => {
            const optParams: OptimizationParams = {
                scale: params[0],
                rotation: params[1],
                translateLng: params[2],
                translateLat: params[3]
            }
            return calculateCost(optParams, normalizedPoints, spatialIndex, location.lat, initialRadius)
        }

        // Run Nelder-Mead optimization
        const optimResult = nelderMead(costFn, initialParams, 150)

        const optimalParams: OptimizationParams = {
            scale: optimResult.params[0],
            rotation: optimResult.params[1],
            translateLng: optimResult.params[2],
            translateLat: optimResult.params[3]
        }

        const optimizeTime = Date.now() - optimizeStart
        console.log(`   Optimization complete in ${optimizeTime}ms`)
        console.log(`   Optimal: scale=${optimalParams.scale.toFixed(0)}m, rotation=${(optimalParams.rotation * 180 / Math.PI).toFixed(1)}°`)
        console.log(`   Center shift: (${((optimalParams.translateLng - location.lng) * 111000).toFixed(0)}m, ${((optimalParams.translateLat - location.lat) * 111000).toFixed(0)}m)`)

        // ========================================
        // PHASE 2: GENERATE OPTIMIZED WAYPOINTS
        // ========================================
        console.log('📍 Phase 2: Generating optimized waypoints...')

        // Generate waypoints with desired count for routing (not all shape points)
        const routingNormalizedPoints = generateNormalizedShapePoints(shapeType, waypointCount)
        const routingWaypoints = transformShapePoints(routingNormalizedPoints, optimalParams, location.lat)

        console.log(`   Generated ${routingWaypoints.length} routing waypoints`)

        // Snap waypoints to street network with connectivity-aware selection
        const snappedWaypoints: Array<{ lat: number; lng: number; nodeId: string; snapDistance: number }> = []
        let totalSnapDistance = 0
        let maxSnapDistance = 0

        for (let i = 0; i < routingWaypoints.length; i++) {
            const wp = routingWaypoints[i]

            // Find multiple candidate nodes (not just nearest)
            const candidates = spatialIndex.findKNearest(wp, 5)

            if (candidates.length === 0) {
                console.error(`No nodes found near waypoint ${i + 1}`)
                continue
            }

            // For first waypoint or if no previous snapped, use nearest
            if (snappedWaypoints.length === 0) {
                const nearest = candidates[0]
                const nodeAttrs = graph.getNodeAttributes(nearest.nodeId)
                snappedWaypoints.push({
                    lat: nodeAttrs.lat,
                    lng: nodeAttrs.lng,
                    nodeId: nearest.nodeId,
                    snapDistance: nearest.distance
                })
                totalSnapDistance += nearest.distance
                maxSnapDistance = Math.max(maxSnapDistance, nearest.distance)
                continue
            }

            // For subsequent waypoints, prefer nodes that are close to previous snapped node
            const prevSnapped = snappedWaypoints[snappedWaypoints.length - 1]
            const prevCoord = { lat: prevSnapped.lat, lng: prevSnapped.lng }

            // Calculate ideal distance between waypoints (straight line)
            const idealWpDistance = haversineDistance(routingWaypoints[i - 1] || wp, wp)

            // Score each candidate: prefer close snap + reasonable distance from previous
            let bestCandidate = candidates[0]
            let bestScore = Infinity

            for (const candidate of candidates) {
                const candidateAttrs = graph.getNodeAttributes(candidate.nodeId)
                const candidateCoord = { lat: candidateAttrs.lat, lng: candidateAttrs.lng }

                // Distance from previous snapped node
                const distFromPrev = haversineDistance(prevCoord, candidateCoord)

                // Score: snap distance + penalty for being far from previous
                // If distFromPrev > 3x idealWpDistance, heavily penalize
                const distancePenalty = distFromPrev > idealWpDistance * 3
                    ? (distFromPrev - idealWpDistance) * 2
                    : 0

                const score = candidate.distance + distancePenalty

                if (score < bestScore) {
                    bestScore = score
                    bestCandidate = candidate
                }
            }

            const nodeAttrs = graph.getNodeAttributes(bestCandidate.nodeId)
            snappedWaypoints.push({
                lat: nodeAttrs.lat,
                lng: nodeAttrs.lng,
                nodeId: bestCandidate.nodeId,
                snapDistance: bestCandidate.distance
            })
            totalSnapDistance += bestCandidate.distance
            maxSnapDistance = Math.max(maxSnapDistance, bestCandidate.distance)
        }

        const avgSnapDistance = totalSnapDistance / snappedWaypoints.length
        console.log(`   Snap distances: avg=${avgSnapDistance.toFixed(0)}m, max=${maxSnapDistance.toFixed(0)}m`)

        // ========================================
        // PHASE 3: A* ROUTING
        // ========================================
        console.log('🛤️ Phase 3: A* routing between waypoints...')
        const routeStart = Date.now()

        // Generate dense shape points for corridor/direction calculation
        const denseShapePoints = transformShapePoints(
            generateNormalizedShapePoints(shapeType, 200),
            optimalParams,
            location.lat
        )

        // Calculate adaptive corridor and direction penalty
        // Use wider corridor (300m) to allow more routing flexibility
        // Lower direction penalty to avoid forcing routes backwards
        const corridorWidth = Math.min(300, Math.max(150, optimalParams.scale * 0.12))
        const directionPenalty = Math.min(0.5, 0.3 + (targetDistanceKm / 150))

        console.log(`   Corridor: ${corridorWidth.toFixed(0)}m, Direction penalty: ${directionPenalty.toFixed(2)}`)

        // Use snapped waypoint coordinates so routing uses the exact nodes we selected
        const snappedCoords = snappedWaypoints.map(wp => ({ lat: wp.lat, lng: wp.lng }))

        const segments = routeShapeWithCurveFollowing(
            graph,
            snappedCoords,
            denseShapePoints,
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
                { error: 'Route generation failed. Try a different location.' },
                { status: 500 }
            )
        }

        // ========================================
        // BUILD RESPONSE
        // ========================================
        const geojson = segmentsToGeoJSON(segments)
        const actualDistanceKm = parseFloat(geojson.properties.totalDistanceKm)
        const distanceError = Math.abs(actualDistanceKm - targetDistanceKm) / targetDistanceKm

        // Add waypoint markers for visualization - use SNAPPED positions (actual street nodes)
        const waypointFeatures = snappedWaypoints.map((wp, index) => ({
            type: 'Feature' as const,
            properties: {
                type: 'waypoint',
                index: index,
                label: `WP ${index + 1}`,
                snapDistance: Math.round(wp.snapDistance),
            },
            geometry: {
                type: 'Point' as const,
                coordinates: [wp.lng, wp.lat]
            }
        }))

        const result = {
            ...geojson,
            features: [...geojson.features, ...waypointFeatures],
            properties: {
                ...geojson.properties,
                shape: shapeType,
                center: location,
                optimizedCenter: {
                    lat: optimalParams.translateLat,
                    lng: optimalParams.translateLng
                },
                targetDistanceKm,
                actualDistanceKm,
                distanceError: `${(distanceError * 100).toFixed(1)}%`,
                optimizedScale: Math.round(optimalParams.scale),
                optimizedRotation: `${(optimalParams.rotation * 180 / Math.PI).toFixed(1)}°`,
                corridorWidth: Math.round(corridorWidth),
                directionPenalty,
                waypointCount: routingWaypoints.length,
                avgSnapDistance: Math.round(avgSnapDistance),
                maxSnapDistance: Math.round(maxSnapDistance),
                graphLoadTimeMs: graphTime,
                optimizationTimeMs: optimizeTime,
                routingTimeMs: routeTime,
                method: 'optimized-curve-following',
            }
        }

        console.log(`✅ [OPTIMIZED-ROUTE] Complete: ${actualDistanceKm.toFixed(2)}km (${(distanceError * 100).toFixed(1)}% error)`)
        console.log(`   Total time: ${graphTime + optimizeTime + routeTime}ms`)

        return NextResponse.json(result)

    } catch (err: any) {
        console.error('[OPTIMIZED-ROUTE ERROR]', err)
        return NextResponse.json(
            { error: err.message || 'Internal Server Error' },
            { status: 500 }
        )
    }
}

export async function GET() {
    return NextResponse.json({
        service: 'optimized-route',
        description: 'Hybrid router: Nelder-Mead optimization + A* pathfinding',
        status: graphCache ? 'ready' : 'not-loaded',
        supportedRegion: 'Munich, Germany',
        supportedShapes: ['heart', 'circle', 'star', 'square'],
        method: 'Phase 1: Optimize shape placement, Phase 2: A* routing',
        example: {
            method: 'POST',
            body: {
                location: { lat: 48.1351, lng: 11.5820 },
                shape: 'heart',
                targetDistanceKm: 30
            }
        }
    })
}
