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
    segmentsToGeoJSON,
    calculateDirection,
    angularDifference,
    detectUTurns
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
    uTurnCount: number          // count of detected U-turns
}

interface QualityThresholds {
    maxDistanceError: number    // e.g., 0.25 (25%)
    maxDetourRatio: number      // e.g., 6.0 (6x)
    maxSuspiciousSegments: number // e.g., 2
    maxFallbackPercent: number  // e.g., 0.30 (30%)
    maxUTurns: number           // e.g., 2
}

const DEFAULT_THRESHOLDS: QualityThresholds = {
    maxDistanceError: 0.25,      // 25% distance variance allowed
    maxDetourRatio: 6.0,         // No segment should be > 6x straight-line
    maxSuspiciousSegments: 2,    // Max 2 suspicious segments
    maxFallbackPercent: 0.30,    // Max 30% of segments needing fallback
    maxUTurns: 8,                // Max 8 U-turns (about 20% of typical 40 waypoints)
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

    if (metrics.uTurnCount > thresholds.maxUTurns) {
        issues.push(`${metrics.uTurnCount} U-turns > ${thresholds.maxUTurns}`)
    }

    // Calculate quality score (lower is better)
    // Weighted combination of metrics
    const score =
        metrics.distanceError * 100 +           // Distance error weight: 100
        metrics.maxDetourRatio * 5 +            // Max detour weight: 5
        metrics.avgDetourRatio * 10 +           // Avg detour weight: 10
        metrics.suspiciousSegments * 20 +       // Suspicious segment penalty: 20 each
        fallbackPercent * 30 +                  // Fallback rate weight: 30
        metrics.uTurnCount * 25                 // U-turn penalty: 25 each

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
    segments: Array<{ distance: number; coordinates: Array<{ lat: number; lng: number }>; nodeIds: string[] }>,
    targetDistanceKm: number,
    waypointCoords: Array<{ lat: number; lng: number }>
): QualityMetrics {
    let totalDistance = 0
    let maxDetourRatio = 0
    let totalDetourRatio = 0
    let suspiciousSegments = 0
    let fallbackCount = 0  // We'll estimate this from high detour ratios
    let uTurnCount = 0

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

        // Detect U-turns in this segment
        uTurnCount += detectUTurns({ nodeIds: seg.nodeIds, coordinates: seg.coordinates, distance: seg.distance })
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
        totalSegments: segments.length,
        uTurnCount
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
 * Calculate perpendicular distance from point P to line segment AB
 * Returns the shortest distance from P to the line, or to the segment endpoints if P projects outside AB
 */
function perpendicularDistance(
    p: { lat: number; lng: number },
    a: { lat: number; lng: number },
    b: { lat: number; lng: number }
): number {
    const abLat = b.lat - a.lat
    const abLng = b.lng - a.lng
    const apLat = p.lat - a.lat
    const apLng = p.lng - a.lng

    const abLengthSq = abLat * abLat + abLng * abLng

    if (abLengthSq === 0) {
        // A and B are the same point
        return haversineDistance(p, a)
    }

    // Project P onto line AB, clamped to segment
    let t = (apLat * abLat + apLng * abLng) / abLengthSq
    t = Math.max(0, Math.min(1, t))

    const closest = {
        lat: a.lat + t * abLat,
        lng: a.lng + t * abLng
    }

    return haversineDistance(p, closest)
}

/**
 * Prune redundant waypoints that lie approximately on the path between their neighbors.
 * A waypoint B is redundant if it's very close to the line segment A→C.
 * This prevents unnecessary detours to reach waypoints that the route would pass anyway.
 */
function pruneRedundantWaypoints(
    waypoints: Array<{ lat: number; lng: number; nodeId: string; snapDistance: number }>,
    thresholdMeters: number = 40  // Waypoints within 40m of the A→C line are considered redundant
): Array<{ lat: number; lng: number; nodeId: string; snapDistance: number }> {
    if (waypoints.length <= 3) return waypoints

    const pruned: typeof waypoints = [waypoints[0]]  // Always keep first waypoint

    for (let i = 1; i < waypoints.length - 1; i++) {
        const prev = pruned[pruned.length - 1]
        const curr = waypoints[i]
        const next = waypoints[i + 1]

        // Calculate perpendicular distance from current to line prev→next
        const perpDist = perpendicularDistance(curr, prev, next)

        // Also check: is curr roughly between prev and next? (not a backtrack)
        const prevToNext = haversineDistance(prev, next)
        const prevToCurr = haversineDistance(prev, curr)
        const currToNext = haversineDistance(curr, next)

        // If curr is roughly inline (perpendicular distance small) AND
        // the path through curr isn't significantly longer than direct path
        const pathThroughCurr = prevToCurr + currToNext
        const detourRatio = prevToNext > 0 ? pathThroughCurr / prevToNext : 1

        // Keep waypoint if:
        // 1. It's far from the line (significant shape feature), OR
        // 2. Going through it would be a significant detour (> 1.3x)
        const isSignificantShapeFeature = perpDist > thresholdMeters
        const wouldCauseDetour = detourRatio > 1.3

        if (isSignificantShapeFeature || wouldCauseDetour) {
            pruned.push(curr)
        }
        // Otherwise, skip this waypoint - it's redundant
    }

    // Always keep last waypoint (for loop closure)
    pruned.push(waypoints[waypoints.length - 1])

    return pruned
}

/**
 * Calculate average edge length in the graph to determine optimal waypoint spacing
 */
function calculateAverageEdgeLength(graph: StreetGraph): number {
    let totalLength = 0
    let edgeCount = 0

    graph.forEachEdge((edge) => {
        const attrs = graph.getEdgeAttributes(edge)
        if (attrs.distance && attrs.distance > 0) {
            totalLength += attrs.distance
            edgeCount++
        }
    })

    if (edgeCount === 0) return 100  // Default fallback

    return totalLength / edgeCount
}

/**
 * Calculate optimal waypoint count based on route length and street network density
 *
 * The idea: waypoint spacing should be ~2-3x the average edge length
 * This ensures each segment can be routed through 2-3 street edges naturally
 */
function calculateOptimalWaypointCount(
    targetDistanceKm: number,
    avgEdgeLength: number,
    shapeType: string
): { count: number; spacing: number } {
    // Target spacing: 2x average edge length, with min/max bounds
    const minSpacing = 80   // Never closer than 80m (too precise for street snapping)
    const maxSpacing = 500  // Never more than 500m apart (shape loses definition)

    // Base spacing on edge length: 2x average edge for good routing flexibility
    let targetSpacing = Math.max(minSpacing, Math.min(maxSpacing, avgEdgeLength * 2))

    // Adjust for shape complexity - hearts need more points at the curves
    const complexityMultiplier: Record<string, number> = {
        heart: 0.85,   // Tighter spacing for complex curves
        star: 0.8,     // Tightest for star points
        circle: 1.2,   // Can be sparser for smooth circle
        square: 1.1,   // Slightly sparser for straight edges
    }

    targetSpacing *= complexityMultiplier[shapeType] || 1.0

    // Calculate waypoint count from perimeter and spacing
    const perimeterMeters = targetDistanceKm * 1000
    let count = Math.round(perimeterMeters / targetSpacing)

    // Bounds: minimum 16 (maintain shape), maximum 80 (avoid too many points)
    count = Math.max(16, Math.min(80, count))

    const actualSpacing = perimeterMeters / count

    return { count, spacing: actualSpacing }
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
    waypointsPruned: number
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
        const candidates = spatialIndex.findKNearest(wp, 10)  // More candidates for better direction matching

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

        // Calculate expected direction from previous snapped waypoint to current ideal waypoint
        const expectedDirection = calculateDirection(prevCoord, wp)

        let bestCandidate = candidates[0]
        let bestScore = Infinity

        for (const candidate of candidates) {
            // Skip if this would snap to the same node as previous waypoint
            if (candidate.nodeId === prevSnapped.nodeId) {
                continue
            }

            const candidateAttrs = graph.getNodeAttributes(candidate.nodeId)
            const candidateCoord = { lat: candidateAttrs.lat, lng: candidateAttrs.lng }
            const distFromPrev = haversineDistance(prevCoord, candidateCoord)

            // Distance penalty for nodes that are too far from previous
            const distancePenalty = distFromPrev > idealWpDistance * 3
                ? (distFromPrev - idealWpDistance) * 2
                : 0

            // Direction penalty: prefer candidates in the forward direction along the shape
            // Calculate direction from previous snapped waypoint to this candidate
            const candidateDirection = calculateDirection(prevCoord, candidateCoord)
            const angleDiff = angularDifference(expectedDirection, candidateDirection)

            // Moderate penalty for candidates off the expected direction
            // Not too aggressive to avoid forcing bad snaps
            let directionScore = 0
            if (angleDiff > Math.PI * 2 / 3) {
                // More than 120° off (going backward) - strong penalty
                directionScore = angleDiff * 80
            } else if (angleDiff > Math.PI / 2) {
                // 90-120° off - moderate penalty
                directionScore = angleDiff * 40
            } else if (angleDiff > Math.PI / 4) {
                // 45-90° off - light penalty
                directionScore = angleDiff * 15
            }

            const score = candidate.distance + distancePenalty + directionScore

            if (score < bestScore) {
                bestScore = score
                bestCandidate = candidate
            }
        }

        // If all candidates were skipped (same as prev), just use the closest
        if (bestScore === Infinity) {
            bestCandidate = candidates.find(c => c.nodeId !== prevSnapped.nodeId) || candidates[0]
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

    // Prune redundant waypoints that lie on the path between neighbors
    // This prevents unnecessary detours to waypoints that the route would pass through anyway
    const prunedWaypoints = pruneRedundantWaypoints(snappedWaypoints, 25)  // 25m threshold - conservative
    const waypointsPruned = snappedWaypoints.length - prunedWaypoints.length

    if (prunedWaypoints.length < 3) return null

    const avgSnapDistance = totalSnapDistance / prunedWaypoints.length

    // Generate dense shape points for corridor
    const denseShapePoints = transformShapePoints(
        generateNormalizedShapePoints(shapeType, 200),
        params,
        centerLat
    )

    // Calculate corridor and penalty
    // Balanced corridor: tight enough to prevent large detours, wide enough for connectivity
    const waypointSpacing = (params.scale * 2 * Math.PI) / waypointCount
    // Corridor should be 60-80% of waypoint spacing, minimum 100m, capped at 200m
    const corridorWidth = Math.min(200, Math.max(100, waypointSpacing * 0.7))

    // Much stronger direction penalty to prevent U-turns and backtracking
    const directionPenalty = Math.min(1.5, 1.0 + (targetDistanceKm / 100))

    // Route using pruned waypoints
    const prunedCoords = prunedWaypoints.map(wp => ({ lat: wp.lat, lng: wp.lng }))
    const segments = routeShapeWithCurveFollowing(
        graph,
        prunedCoords,
        denseShapePoints,
        (coord) => spatialIndex.findNearest(coord),
        {
            corridorWidth,
            directionPenalty,
            closeLoop: true,
            findKNearestNodes: (coord, k) => spatialIndex.findKNearest(coord, k)
        }
    )

    if (!segments || segments.length === 0) return null

    // Calculate quality metrics
    const metrics = calculateMetrics(segments, targetDistanceKm, prunedCoords)
    const qualityAssessment = assessQuality(metrics)

    return {
        segments,
        snappedWaypoints: prunedWaypoints,
        waypointsPruned,
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

// Position offsets to try (as fraction of shape radius) if rotation doesn't help
// These shift the entire shape in cardinal and diagonal directions
const POSITION_OFFSET_DIRECTIONS = [
    { name: 'N',  dLat: 1,  dLng: 0 },
    { name: 'S',  dLat: -1, dLng: 0 },
    { name: 'E',  dLat: 0,  dLng: 1 },
    { name: 'W',  dLat: 0,  dLng: -1 },
    { name: 'NE', dLat: 0.7, dLng: 0.7 },
    { name: 'NW', dLat: 0.7, dLng: -0.7 },
    { name: 'SE', dLat: -0.7, dLng: 0.7 },
    { name: 'SW', dLat: -0.7, dLng: -0.7 },
]

// Position offset magnitudes to try (as fraction of shape radius)
const POSITION_OFFSET_MAGNITUDES = [0.3, 0.5, 0.7]

/**
 * Apply a position offset to optimization params
 * @param baseParams - Original optimization parameters
 * @param direction - Direction to offset {dLat, dLng} normalized
 * @param magnitude - How far to offset as fraction of shape scale
 * @param centerLat - Center latitude for degree conversion
 */
function applyPositionOffset(
    baseParams: OptimizationParams,
    direction: { dLat: number; dLng: number },
    magnitude: number,
    centerLat: number
): OptimizationParams {
    // Convert offset from meters to degrees
    const offsetMeters = baseParams.scale * magnitude
    const metersPerDegreeLat = 111320
    const metersPerDegreeLng = 40075000 * Math.cos((centerLat * Math.PI) / 180) / 360

    const offsetLat = (direction.dLat * offsetMeters) / metersPerDegreeLat
    const offsetLng = (direction.dLng * offsetMeters) / metersPerDegreeLng

    return {
        ...baseParams,
        translateLat: baseParams.translateLat + offsetLat,
        translateLng: baseParams.translateLng + offsetLng
    }
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
        let bestRotationOffset = 0
        let usedPositionOffset: { direction: string; magnitude: number } | null = null

        // ---- PHASE A: Try rotation offsets at original position ----
        console.log('   Phase A: Trying rotation offsets at original position...')

        for (const rotationOffset of ROTATION_OFFSETS) {
            attemptCount++
            const rotationDegrees = (rotationOffset * 180 / Math.PI).toFixed(0)
            console.log(`   [A${attemptCount}] Rotation ${rotationDegrees}°`)

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
                bestRotationOffset = rotationOffset
                break  // Found a good route, stop searching
            }

            // Track best result even if it doesn't pass thresholds
            if (qualityAssessment.score < bestScore) {
                bestResult = result
                bestScore = qualityAssessment.score
                bestRotationOffset = rotationOffset
                console.log(`     📊 New best (issues: ${qualityAssessment.issues.join(', ')})`)
            }
        }

        // ---- PHASE B: If quality didn't pass, try position offsets ----
        if (bestResult && !bestResult.qualityAssessment.passed) {
            console.log('   Phase B: Trying position offsets to avoid barriers...')

            // Try different position offsets with the best rotation found
            positionLoop:
            for (const magnitude of POSITION_OFFSET_MAGNITUDES) {
                for (const direction of POSITION_OFFSET_DIRECTIONS) {
                    attemptCount++

                    // Apply position offset to optimal params
                    const offsetParams = applyPositionOffset(
                        optimalParams,
                        direction,
                        magnitude,
                        location.lat
                    )

                    console.log(`   [B${attemptCount - ROTATION_OFFSETS.length}] Position ${direction.name} ${(magnitude * 100).toFixed(0)}% (${Math.round(optimalParams.scale * magnitude)}m)`)

                    // Try with the best rotation found in Phase A
                    const result = generateRouteWithRotation(
                        graph,
                        spatialIndex,
                        offsetParams,
                        bestRotationOffset,
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
                        console.log(`     ✅ Quality passed with position offset!`)
                        bestResult = result
                        bestScore = qualityAssessment.score
                        usedPositionOffset = { direction: direction.name, magnitude }
                        break positionLoop
                    }

                    // Track best result even if it doesn't pass thresholds
                    if (qualityAssessment.score < bestScore) {
                        bestResult = result
                        bestScore = qualityAssessment.score
                        usedPositionOffset = { direction: direction.name, magnitude }
                        console.log(`     📊 New best (issues: ${qualityAssessment.issues.join(', ')})`)
                    }
                }
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
            const offsetInfo = usedPositionOffset
                ? ` with position offset ${usedPositionOffset.direction} ${(usedPositionOffset.magnitude * 100).toFixed(0)}%`
                : ''
            console.log(`🎉 Found quality route on attempt ${attemptCount}${offsetInfo}`)
        } else {
            console.log(`⚠️ Using best available route (score: ${bestScore.toFixed(1)})`)
            console.log(`   Issues: ${bestResult.qualityAssessment.issues.join(', ')}`)
            if (usedPositionOffset) {
                console.log(`   Best position offset: ${usedPositionOffset.direction} ${(usedPositionOffset.magnitude * 100).toFixed(0)}%`)
            }
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
                waypointsPruned: bestResult.waypointsPruned,
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
                uTurnCount: bestResult.metrics.uTurnCount,
                attemptCount,
                // Position offset info (if used)
                positionOffsetUsed: usedPositionOffset !== null,
                positionOffsetDirection: usedPositionOffset?.direction || null,
                positionOffsetMagnitude: usedPositionOffset ? `${(usedPositionOffset.magnitude * 100).toFixed(0)}%` : null,
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
            'Rotation offsets (7 attempts: 0°, ±15°, ±30°, ±45°)',
            'Position offsets to avoid barriers (8 directions × 3 magnitudes)',
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
