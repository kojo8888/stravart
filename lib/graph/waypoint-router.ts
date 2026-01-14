/**
 * Connect waypoints into a complete route using graph routing
 */

import type { StreetGraph, Waypoint, Route, RoutePath, Coordinate } from './types'
import { findRoute } from './router'
import { SpatialIndex } from './spatial-index'

/**
 * Route between consecutive waypoints to create a complete shape route
 *
 * @param graph - Street network graph
 * @param spatialIndex - Spatial index for finding nearest nodes
 * @param waypoints - Ordered waypoints defining the shape
 * @param options - Routing options
 * @returns Complete route connecting all waypoints
 */
export function routeThroughWaypoints(
    graph: StreetGraph,
    spatialIndex: SpatialIndex,
    waypoints: Waypoint[],
    options: {
        closeLoop?: boolean // Whether to connect last waypoint back to first
        maxSegmentDistance?: number // Max distance for a single segment (meters)
        skipUnreachable?: boolean // Skip waypoints that can't be reached
        onProgress?: (current: number, total: number) => void
    } = {}
): Route | null {
    const {
        closeLoop = true,
        maxSegmentDistance = 50000, // 50km max per segment
        skipUnreachable = true,
        onProgress,
    } = options

    if (waypoints.length < 2) {
        console.error('Need at least 2 waypoints to route')
        return null
    }

    console.log(`🛣️  Routing through ${waypoints.length} waypoints...`)
    if (closeLoop) {
        console.log('   (closing loop back to start)')
    }

    const segments: RoutePath[] = []
    const failedSegments: Array<{ from: number; to: number }> = []
    let totalDistance = 0

    // Determine how many segments we need
    const segmentCount = closeLoop ? waypoints.length : waypoints.length - 1

    for (let i = 0; i < segmentCount; i++) {
        const fromWaypoint = waypoints[i]
        const toWaypoint = waypoints[(i + 1) % waypoints.length]

        if (onProgress) {
            onProgress(i + 1, segmentCount)
        }

        // Find nearest nodes for waypoints
        const fromNode = spatialIndex.findNearest({
            lat: fromWaypoint.lat,
            lng: fromWaypoint.lng,
        })
        const toNode = spatialIndex.findNearest({
            lat: toWaypoint.lat,
            lng: toWaypoint.lng,
        })

        if (!fromNode || !toNode) {
            console.warn(`⚠️  Could not find nodes for segment ${i + 1}/${segmentCount}`)
            failedSegments.push({ from: i, to: (i + 1) % waypoints.length })
            if (!skipUnreachable) {
                return null
            }
            continue
        }

        // Route between nodes
        const route = findRoute(graph, fromNode.nodeId, toNode.nodeId)

        if (!route) {
            console.warn(
                `⚠️  No route found for segment ${i + 1}/${segmentCount} (${fromNode.nodeId} → ${toNode.nodeId})`
            )
            failedSegments.push({ from: i, to: (i + 1) % waypoints.length })
            if (!skipUnreachable) {
                return null
            }
            continue
        }

        // Check if segment is too long
        if (route.distance > maxSegmentDistance) {
            console.warn(
                `⚠️  Segment ${i + 1}/${segmentCount} is ${(route.distance / 1000).toFixed(
                    1
                )}km (max: ${maxSegmentDistance / 1000}km)`
            )
            failedSegments.push({ from: i, to: (i + 1) % waypoints.length })
            if (!skipUnreachable) {
                return null
            }
            continue
        }

        segments.push(route)
        totalDistance += route.distance
    }

    if (segments.length === 0) {
        console.error('❌ No segments could be routed')
        return null
    }

    // Combine all segment coordinates into one array
    const allCoordinates: Coordinate[] = []
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]
        // Add all coordinates except the last one (to avoid duplicates)
        if (i < segments.length - 1) {
            allCoordinates.push(...segment.coordinates.slice(0, -1))
        } else {
            // For last segment, include the last coordinate
            allCoordinates.push(...segment.coordinates)
        }
    }

    console.log(`✅ Routed ${segments.length}/${segmentCount} segments successfully`)
    if (failedSegments.length > 0) {
        console.warn(`⚠️  ${failedSegments.length} segments failed`)
    }
    console.log(`📏 Total distance: ${(totalDistance / 1000).toFixed(2)}km`)

    return {
        waypoints,
        segments,
        totalDistance,
        coordinates: allCoordinates,
    }
}

/**
 * Get statistics about a complete route
 */
export function getRouteStatistics(route: Route) {
    const nodeCount = route.coordinates.length
    const segmentCount = route.segments.length

    let minSegmentDistance = Infinity
    let maxSegmentDistance = 0
    let totalNodes = 0

    for (const segment of route.segments) {
        minSegmentDistance = Math.min(minSegmentDistance, segment.distance)
        maxSegmentDistance = Math.max(maxSegmentDistance, segment.distance)
        totalNodes += segment.nodeIds.length
    }

    return {
        waypoints: route.waypoints.length,
        segments: segmentCount,
        totalNodes: nodeCount,
        avgNodesPerSegment: Math.round(totalNodes / segmentCount),
        totalDistance: route.totalDistance,
        totalDistanceKm: (route.totalDistance / 1000).toFixed(2),
        avgSegmentDistance: Math.round(route.totalDistance / segmentCount),
        minSegmentDistance: Math.round(minSegmentDistance),
        maxSegmentDistance: Math.round(maxSegmentDistance),
    }
}

/**
 * Convert route to GeoJSON format for visualization
 */
export function routeToGeoJSON(route: Route) {
    return {
        type: 'FeatureCollection' as const,
        features: [
            {
                type: 'Feature' as const,
                properties: {
                    distance: route.totalDistance,
                    distanceKm: (route.totalDistance / 1000).toFixed(2),
                    waypoints: route.waypoints.length,
                    segments: route.segments.length,
                    nodes: route.coordinates.length,
                },
                geometry: {
                    type: 'LineString' as const,
                    coordinates: route.coordinates.map((coord) => [coord.lng, coord.lat]),
                },
            },
        ],
    }
}

/**
 * Optimize waypoint order to minimize total route distance
 * Uses nearest neighbor heuristic (greedy algorithm)
 *
 * Note: This is a simplified approach. For better results, could use:
 * - 2-opt algorithm
 * - Genetic algorithm
 * - Simulated annealing
 */
export function optimizeWaypointOrder(
    waypoints: Waypoint[],
    startIndex: number = 0
): Waypoint[] {
    if (waypoints.length <= 2) {
        return waypoints
    }

    const optimized: Waypoint[] = []
    const remaining = [...waypoints]
    let current = remaining.splice(startIndex, 1)[0]
    optimized.push(current)

    while (remaining.length > 0) {
        // Find nearest remaining waypoint
        let nearestIndex = 0
        let nearestDistance = Infinity

        for (let i = 0; i < remaining.length; i++) {
            const distance = haversineDistance(
                { lat: current.lat, lng: current.lng },
                { lat: remaining[i].lat, lng: remaining[i].lng }
            )

            if (distance < nearestDistance) {
                nearestDistance = distance
                nearestIndex = i
            }
        }

        current = remaining.splice(nearestIndex, 1)[0]
        optimized.push(current)
    }

    // Update order indices
    return optimized.map((wp, index) => ({ ...wp, order: index }))
}

/**
 * Haversine distance (copied to avoid circular import)
 */
function haversineDistance(coord1: Coordinate, coord2: Coordinate): number {
    const R = 6371000
    const lat1 = (coord1.lat * Math.PI) / 180
    const lat2 = (coord2.lat * Math.PI) / 180
    const deltaLat = ((coord2.lat - coord1.lat) * Math.PI) / 180
    const deltaLng = ((coord2.lng - coord1.lng) * Math.PI) / 180

    const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
}
