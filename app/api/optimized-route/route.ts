/**
 * Optimized Route API - Hybrid approach combining:
 * 1. Nelder-Mead optimization to find best shape placement (position, scale, rotation)
 * 2. Graph-based A* routing to create connected, rideable routes
 *
 * This combines the best of both worlds:
 * - Optimization ensures waypoints land near actual streets
 * - A* routing creates a continuous, rideable path
 *
 * Now supports WORLDWIDE routing by fetching OSM data dynamically!
 */

import { NextResponse } from 'next/server'
import {
    routeShapeWithCurveFollowing,
    segmentsToGeoJSON
} from '@/lib/graph/curve-router'
import { haversineDistance } from '@/lib/graph/utils'
import { fetchAndBuildGraph, calculateBBox } from '@/lib/graph/osm-fetcher'
import type { StreetGraph } from '@/lib/graph/types'
import type { SpatialIndex } from '@/lib/graph/spatial-index'

// ========================================
// QUALITY METRICS & THRESHOLDS
// ========================================

interface QualityMetrics {
    distanceError: number       // |actual - target| / target (0.0 - 1.0+)
    maxDetourRatio: number      // max(segment_dist / straight_line_dist)
    avgDetourRatio: number      // average detour ratio
    suspiciousSegments: number  // count of segments with detour > 5x
    fallbackCount: number       // segments that needed expanded corridor
    totalSegments: number
}

interface QualityThresholds {
    maxDistanceError: number    // e.g., 0.25 (25%)
    maxDetourRatio: number      // e.g., 6.0 (6x)
    maxSuspiciousSegments: number // e.g., 2
    maxFallbackPercent: number  // e.g., 0.30 (30%)
}

const DEFAULT_THRESHOLDS: QualityThresholds = {
    maxDistanceError: 0.25,      // 25% distance variance allowed
    maxDetourRatio: 6.0,         // No segment should be > 6x straight-line
    maxSuspiciousSegments: 2,    // Max 2 suspicious segments
    maxFallbackPercent: 0.30,    // Max 30% of segments needing fallback
}

/**
 * Assess route quality and determine if it passes thresholds
 */
function assessQuality(
    metrics: QualityMetrics,
    thresholds: QualityThresholds = DEFAULT_THRESHOLDS
): { passed: boolean; score: number; issues: string[] } {
    const issues: string[] = []

    if (metrics.distanceError > thresholds.maxDistanceError) {
        issues.push(`Distance error ${(metrics.distanceError * 100).toFixed(1)}% > ${(thresholds.maxDistanceError * 100).toFixed(0)}%`)
    }

    if (metrics.maxDetourRatio > thresholds.maxDetourRatio) {
        issues.push(`Max detour ${metrics.maxDetourRatio.toFixed(1)}x > ${thresholds.maxDetourRatio}x`)
    }

    if (metrics.suspiciousSegments > thresholds.maxSuspiciousSegments) {
        issues.push(`${metrics.suspiciousSegments} suspicious segments > ${thresholds.maxSuspiciousSegments}`)
    }

    const fallbackPercent = metrics.fallbackCount / metrics.totalSegments
    if (fallbackPercent > thresholds.maxFallbackPercent) {
        issues.push(`Fallback rate ${(fallbackPercent * 100).toFixed(0)}% > ${(thresholds.maxFallbackPercent * 100).toFixed(0)}%`)
    }

    // Calculate quality score (lower is better)
    // Weighted combination of metrics
    const score =
        metrics.distanceError * 100 +           // Distance error weight: 100
        metrics.maxDetourRatio * 5 +            // Max detour weight: 5
        metrics.avgDetourRatio * 10 +           // Avg detour weight: 10
        metrics.suspiciousSegments * 20 +       // Suspicious segment penalty: 20 each
        fallbackPercent * 30                    // Fallback rate weight: 30

    return {
        passed: issues.length === 0,
        score,
        issues
    }
}

/**
 * Calculate quality metrics from route segments
 */
function calculateMetrics(
    segments: Array<{ distance: number; coordinates: Array<{ lat: number; lng: number }> }>,
    targetDistanceKm: number,
    waypointCoords: Array<{ lat: number; lng: number }>
): QualityMetrics {
    let totalDistance = 0
    let maxDetourRatio = 0
    let totalDetourRatio = 0
    let suspiciousSegments = 0
    let fallbackCount = 0  // We'll estimate this from high detour ratios

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        totalDistance += seg.distance

        // Calculate straight-line distance for this segment
        const wpFrom = waypointCoords[i]
        const wpTo = waypointCoords[(i + 1) % waypointCoords.length]
        const straightLine = haversineDistance(wpFrom, wpTo)

        // Avoid division by zero
        const detourRatio = straightLine > 0 ? seg.distance / straightLine : 1

        totalDetourRatio += detourRatio
        maxDetourRatio = Math.max(maxDetourRatio, detourRatio)

        if (detourRatio > 5) {
            suspiciousSegments++
        }

        // Estimate fallback usage from high detour ratios
        if (detourRatio > 3) {
            fallbackCount++
        }
    }

    const actualDistanceKm = totalDistance / 1000
    const distanceError = Math.abs(actualDistanceKm - targetDistanceKm) / targetDistanceKm
    const avgDetourRatio = segments.length > 0 ? totalDetourRatio / segments.length : 0

    return {
        distanceError,
        maxDetourRatio,
        avgDetourRatio,
        suspiciousSegments,
        fallbackCount,
        totalSegments: segments.length
    }
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
// HELPERS
// ========================================

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
// ROUTE GENERATION HELPER
// ========================================

interface RouteResult {
    segments: Array<{ distance: number; coordinates: Array<{ lat: number; lng: number }>; nodeIds: string[] }>
    snappedWaypoints: Array<{ lat: number; lng: number; nodeId: string; snapDistance: number }>
    params: OptimizationParams
    metrics: QualityMetrics
    qualityAssessment: { passed: boolean; score: number; issues: string[] }
    corridorWidth: number
    directionPenalty: number
    avgSnapDistance: number
    maxSnapDistance: number
}

/**
 * Generate a route with specific rotation offset
 * Returns null if route generation fails
 */
function generateRouteWithRotation(
    graph: StreetGraph,
    spatialIndex: SpatialIndex,
    baseParams: OptimizationParams,
    rotationOffset: number,
    shapeType: 'heart' | 'circle' | 'star' | 'square',
    targetDistanceKm: number,
    waypointCount: number,
    centerLat: number
): RouteResult | null {
    // Apply rotation offset to base params
    const params: OptimizationParams = {
        ...baseParams,
        rotation: baseParams.rotation + rotationOffset
    }

    // Generate waypoints with rotated params
    const routingNormalizedPoints = generateNormalizedShapePoints(shapeType, waypointCount)
    const routingWaypoints = transformShapePoints(routingNormalizedPoints, params, centerLat)

    // Snap waypoints with connectivity-aware selection
    const snappedWaypoints: Array<{ lat: number; lng: number; nodeId: string; snapDistance: number }> = []
    let totalSnapDistance = 0
    let maxSnapDistance = 0

    for (let i = 0; i < routingWaypoints.length; i++) {
        const wp = routingWaypoints[i]
        const candidates = spatialIndex.findKNearest(wp, 5)

        if (candidates.length === 0) continue

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

        const prevSnapped = snappedWaypoints[snappedWaypoints.length - 1]
        const prevCoord = { lat: prevSnapped.lat, lng: prevSnapped.lng }
        const idealWpDistance = haversineDistance(routingWaypoints[i - 1] || wp, wp)

        let bestCandidate = candidates[0]
        let bestScore = Infinity

        for (const candidate of candidates) {
            const candidateAttrs = graph.getNodeAttributes(candidate.nodeId)
            const candidateCoord = { lat: candidateAttrs.lat, lng: candidateAttrs.lng }
            const distFromPrev = haversineDistance(prevCoord, candidateCoord)
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

    if (snappedWaypoints.length < 3) return null

    const avgSnapDistance = totalSnapDistance / snappedWaypoints.length

    // Generate dense shape points for corridor
    const denseShapePoints = transformShapePoints(
        generateNormalizedShapePoints(shapeType, 200),
        params,
        centerLat
    )

    // Calculate corridor and penalty
    const corridorWidth = Math.min(300, Math.max(150, params.scale * 0.12))
    const directionPenalty = Math.min(0.5, 0.3 + (targetDistanceKm / 150))

    // Route
    const snappedCoords = snappedWaypoints.map(wp => ({ lat: wp.lat, lng: wp.lng }))
    const segments = routeShapeWithCurveFollowing(
        graph,
        snappedCoords,
        denseShapePoints,
        (coord) => spatialIndex.findNearest(coord),
        { corridorWidth, directionPenalty, closeLoop: true }
    )

    if (!segments || segments.length === 0) return null

    // Calculate quality metrics
    const metrics = calculateMetrics(segments, targetDistanceKm, snappedCoords)
    const qualityAssessment = assessQuality(metrics)

    return {
        segments,
        snappedWaypoints,
        params,
        metrics,
        qualityAssessment,
        corridorWidth,
        directionPenalty,
        avgSnapDistance,
        maxSnapDistance
    }
}

// Rotation offsets to try (in radians) if initial quality is poor
const ROTATION_OFFSETS = [
    0,                      // Original
    Math.PI / 12,           // +15°
    -Math.PI / 12,          // -15°
    Math.PI / 6,            // +30°
    -Math.PI / 6,           // -30°
    Math.PI / 4,            // +45°
    -Math.PI / 4,           // -45°
]

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

        // Validate latitude/longitude ranges
        if (location.lat < -90 || location.lat > 90 || location.lng < -180 || location.lng > 180) {
            return NextResponse.json(
                { error: 'Invalid coordinates: lat must be -90 to 90, lng must be -180 to 180' },
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
        console.log(`   🌍 Worldwide routing enabled!`)

        // Calculate initial radius estimate
        const initialRadius = calculateRadius(targetDistanceKm, shapeType)
        console.log(`   Initial radius estimate: ${initialRadius.toFixed(0)}m`)

        // Generate initial shape points to calculate bbox for fetching
        const initialShapePoints = transformShapePoints(
            generateNormalizedShapePoints(shapeType, 20),
            {
                scale: initialRadius,
                rotation: 0,
                translateLng: location.lng,
                translateLat: location.lat
            },
            location.lat
        )

        // Calculate bbox with padding for routing flexibility
        const paddingMeters = Math.max(500, initialRadius * 0.5)  // At least 500m or half the radius
        const bbox = calculateBBox(initialShapePoints, paddingMeters)

        console.log(`   📦 Fetching OSM data for bbox...`)

        // Fetch graph dynamically for this area
        const graphStart = Date.now()
        const { graph, spatialIndex, fromCache, nodeCount, edgeCount } = await fetchAndBuildGraph(bbox)
        const graphTime = Date.now() - graphStart

        console.log(`   Graph: ${nodeCount} nodes, ${edgeCount} edges (${fromCache ? 'cached' : 'fetched'}) in ${graphTime}ms`)

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
        // PHASE 2 & 3: GENERATE ROUTE WITH AUTO-RETRY
        // ========================================
        console.log('📍 Phase 2-3: Generating route with quality assessment...')
        const routeStart = Date.now()

        let bestResult: RouteResult | null = null
        let bestScore = Infinity
        let attemptCount = 0
        const maxAttempts = ROTATION_OFFSETS.length

        // Try generating routes with different rotation offsets
        for (const rotationOffset of ROTATION_OFFSETS) {
            attemptCount++
            const rotationDegrees = (rotationOffset * 180 / Math.PI).toFixed(0)
            console.log(`   Attempt ${attemptCount}/${maxAttempts}: rotation offset ${rotationDegrees}°`)

            const result = generateRouteWithRotation(
                graph,
                spatialIndex,
                optimalParams,
                rotationOffset,
                shapeType,
                targetDistanceKm,
                waypointCount,
                location.lat
            )

            if (!result) {
                console.log(`     ❌ Route generation failed`)
                continue
            }

            const { qualityAssessment, metrics } = result
            console.log(`     Score: ${qualityAssessment.score.toFixed(1)}, Distance error: ${(metrics.distanceError * 100).toFixed(1)}%`)

            if (qualityAssessment.passed) {
                console.log(`     ✅ Quality passed!`)
                bestResult = result
                bestScore = qualityAssessment.score
                break  // Found a good route, stop searching
            }

            // Track best result even if it doesn't pass thresholds
            if (qualityAssessment.score < bestScore) {
                bestResult = result
                bestScore = qualityAssessment.score
                console.log(`     📊 New best (issues: ${qualityAssessment.issues.join(', ')})`)
            }
        }

        const routeTime = Date.now() - routeStart

        if (!bestResult) {
            return NextResponse.json(
                { error: 'Route generation failed after all attempts. Try a different location.' },
                { status: 500 }
            )
        }

        // Log final result
        if (bestResult.qualityAssessment.passed) {
            console.log(`🎉 Found quality route on attempt ${attemptCount}`)
        } else {
            console.log(`⚠️ Using best available route (score: ${bestScore.toFixed(1)})`)
            console.log(`   Issues: ${bestResult.qualityAssessment.issues.join(', ')}`)
        }

        // ========================================
        // BUILD RESPONSE
        // ========================================
        const geojson = segmentsToGeoJSON(bestResult.segments)
        const actualDistanceKm = parseFloat(geojson.properties.totalDistanceKm)

        // Add waypoint markers for visualization - use SNAPPED positions (actual street nodes)
        const waypointFeatures = bestResult.snappedWaypoints.map((wp, index) => ({
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
                    lat: bestResult.params.translateLat,
                    lng: bestResult.params.translateLng
                },
                targetDistanceKm,
                actualDistanceKm,
                distanceError: `${(bestResult.metrics.distanceError * 100).toFixed(1)}%`,
                optimizedScale: Math.round(bestResult.params.scale),
                optimizedRotation: `${(bestResult.params.rotation * 180 / Math.PI).toFixed(1)}°`,
                corridorWidth: Math.round(bestResult.corridorWidth),
                directionPenalty: bestResult.directionPenalty,
                waypointCount: bestResult.snappedWaypoints.length,
                avgSnapDistance: Math.round(bestResult.avgSnapDistance),
                maxSnapDistance: Math.round(bestResult.maxSnapDistance),
                graphLoadTimeMs: graphTime,
                graphFromCache: fromCache,
                graphNodeCount: nodeCount,
                graphEdgeCount: edgeCount,
                optimizationTimeMs: optimizeTime,
                routingTimeMs: routeTime,
                method: 'optimized-curve-following-worldwide',
                // Quality metrics
                qualityPassed: bestResult.qualityAssessment.passed,
                qualityScore: Math.round(bestResult.qualityAssessment.score * 10) / 10,
                qualityIssues: bestResult.qualityAssessment.issues,
                maxDetourRatio: Math.round(bestResult.metrics.maxDetourRatio * 10) / 10,
                avgDetourRatio: Math.round(bestResult.metrics.avgDetourRatio * 10) / 10,
                suspiciousSegments: bestResult.metrics.suspiciousSegments,
                attemptCount,
            }
        }

        console.log(`✅ [OPTIMIZED-ROUTE] Complete: ${actualDistanceKm.toFixed(2)}km (${(bestResult.metrics.distanceError * 100).toFixed(1)}% error)`)
        console.log(`   Quality: ${bestResult.qualityAssessment.passed ? 'PASSED' : 'BEST EFFORT'} (score: ${bestScore.toFixed(1)}, attempts: ${attemptCount})`)
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
        description: 'Hybrid router: Nelder-Mead optimization + A* pathfinding with dynamic OSM fetching',
        status: 'ready',
        supportedRegion: 'Worldwide (fetches OSM data dynamically)',
        supportedShapes: ['heart', 'circle', 'star', 'square'],
        method: 'Phase 1: Fetch OSM bbox, Phase 2: Optimize shape placement, Phase 3: A* routing',
        features: [
            'Worldwide coverage via Overpass API',
            'Automatic bbox calculation from shape',
            'In-memory graph caching (30 min TTL)',
            'Quality metrics and auto-retry',
        ],
        example: {
            method: 'POST',
            body: {
                location: { lat: 48.1351, lng: 11.5820 },
                shape: 'heart',
                targetDistanceKm: 30
            }
        },
        exampleLocations: {
            munich: { lat: 48.1351, lng: 11.5820 },
            paris: { lat: 48.8566, lng: 2.3522 },
            newYork: { lat: 40.7128, lng: -74.0060 },
            tokyo: { lat: 35.6762, lng: 139.6503 },
        }
    })
}
