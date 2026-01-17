/**
 * Curve-following router for Strava Art
 *
 * This router ensures paths follow the shape curve instead of taking shortcuts.
 * It uses two key techniques:
 * 1. Corridor constraint: Only route through nodes near the shape outline
 * 2. Direction penalty: Prefer edges aligned with the shape's tangent direction
 */

import type { StreetGraph, RoutePath, Coordinate } from './types'
import { haversineDistance } from './utils'

/**
 * Priority queue implementation for A*
 */
class PriorityQueue<T> {
    private items: Array<{ item: T; priority: number }> = []

    enqueue(item: T, priority: number): void {
        this.items.push({ item, priority })
        this.items.sort((a, b) => a.priority - b.priority)
    }

    dequeue(): T | undefined {
        return this.items.shift()?.item
    }

    isEmpty(): boolean {
        return this.items.length === 0
    }
}

/**
 * Calculate the tangent direction at a point along the shape
 * Returns angle in radians (0 = east, π/2 = north)
 */
export function calculateTangentDirection(
    shapePoints: Coordinate[],
    currentIndex: number
): number {
    const n = shapePoints.length

    // Get previous and next points (with wrapping for closed shape)
    const prevIndex = (currentIndex - 1 + n) % n
    const nextIndex = (currentIndex + 1) % n

    const prev = shapePoints[prevIndex]
    const next = shapePoints[nextIndex]

    // Calculate direction from prev to next
    const deltaLng = next.lng - prev.lng
    const deltaLat = next.lat - prev.lat

    return Math.atan2(deltaLat, deltaLng)
}

/**
 * Calculate direction from one coordinate to another
 */
export function calculateDirection(from: Coordinate, to: Coordinate): number {
    const deltaLng = to.lng - from.lng
    const deltaLat = to.lat - from.lat
    return Math.atan2(deltaLat, deltaLng)
}

/**
 * Calculate angular difference between two angles (radians)
 * Returns value between 0 and π
 */
export function angularDifference(angle1: number, angle2: number): number {
    let diff = Math.abs(angle1 - angle2)
    if (diff > Math.PI) {
        diff = 2 * Math.PI - diff
    }
    return diff
}

/**
 * Find the minimum distance from a point to the shape outline
 */
export function distanceToShapeOutline(
    point: Coordinate,
    shapePoints: Coordinate[]
): number {
    let minDistance = Infinity

    for (let i = 0; i < shapePoints.length; i++) {
        const j = (i + 1) % shapePoints.length
        const distance = distanceToLineSegment(point, shapePoints[i], shapePoints[j])
        if (distance < minDistance) {
            minDistance = distance
        }
    }

    return minDistance
}

/**
 * Calculate distance from point to line segment
 */
function distanceToLineSegment(
    point: Coordinate,
    segStart: Coordinate,
    segEnd: Coordinate
): number {
    const dx = segEnd.lng - segStart.lng
    const dy = segEnd.lat - segStart.lat

    if (dx === 0 && dy === 0) {
        // Segment is a point
        return haversineDistance(point, segStart)
    }

    // Project point onto line
    const t = Math.max(0, Math.min(1,
        ((point.lng - segStart.lng) * dx + (point.lat - segStart.lat) * dy) /
        (dx * dx + dy * dy)
    ))

    const projection: Coordinate = {
        lng: segStart.lng + t * dx,
        lat: segStart.lat + t * dy
    }

    return haversineDistance(point, projection)
}

/**
 * Find nodes within a corridor around the shape
 */
export function findNodesInCorridor(
    graph: StreetGraph,
    shapePoints: Coordinate[],
    corridorWidth: number // meters
): Set<string> {
    const nodesInCorridor = new Set<string>()

    graph.forEachNode((nodeId, attrs) => {
        const nodeCoord = { lat: attrs.lat, lng: attrs.lng }
        const distance = distanceToShapeOutline(nodeCoord, shapePoints)

        if (distance <= corridorWidth) {
            nodesInCorridor.add(nodeId)
        }
    })

    return nodesInCorridor
}

/**
 * Find the closest point on the shape to a given coordinate
 * Returns the index of the closest shape segment
 */
function findClosestShapeSegment(
    point: Coordinate,
    shapePoints: Coordinate[]
): number {
    let minDistance = Infinity
    let closestIndex = 0

    for (let i = 0; i < shapePoints.length; i++) {
        const j = (i + 1) % shapePoints.length
        const distance = distanceToLineSegment(point, shapePoints[i], shapePoints[j])
        if (distance < minDistance) {
            minDistance = distance
            closestIndex = i
        }
    }

    return closestIndex
}

/**
 * Calculate expected direction at a point based on nearby shape curve
 */
function getExpectedDirection(
    point: Coordinate,
    shapePoints: Coordinate[]
): number {
    const segmentIndex = findClosestShapeSegment(point, shapePoints)
    return calculateTangentDirection(shapePoints, segmentIndex)
}

/**
 * Direction-aware A* pathfinding that follows the shape curve
 *
 * @param graph - Street network graph
 * @param startNodeId - Starting node
 * @param endNodeId - Ending node
 * @param shapePoints - Points defining the shape curve
 * @param options - Routing options
 */
export function findCurveFollowingRoute(
    graph: StreetGraph,
    startNodeId: string,
    endNodeId: string,
    shapePoints: Coordinate[],
    options: {
        corridorWidth?: number      // Max distance from shape (meters)
        directionPenalty?: number   // Multiplier for direction deviation (0-1)
        allowedNodes?: Set<string>  // Pre-computed corridor nodes
    } = {}
): RoutePath | null {
    const {
        corridorWidth = 200,
        directionPenalty = 0.5,
        allowedNodes
    } = options

    // Get or compute corridor nodes
    const corridor = allowedNodes || findNodesInCorridor(graph, shapePoints, corridorWidth)

    // Verify start and end are in corridor (expand if needed)
    if (!corridor.has(startNodeId)) {
        corridor.add(startNodeId)
    }
    if (!corridor.has(endNodeId)) {
        corridor.add(endNodeId)
    }

    // A* with direction-aware cost
    const openSet = new PriorityQueue<string>()
    const cameFrom = new Map<string, string>()
    const gScore = new Map<string, number>()
    const fScore = new Map<string, number>()

    const startAttrs = graph.getNodeAttributes(startNodeId)
    const endAttrs = graph.getNodeAttributes(endNodeId)
    const startCoord = { lat: startAttrs.lat, lng: startAttrs.lng }
    const endCoord = { lat: endAttrs.lat, lng: endAttrs.lng }

    gScore.set(startNodeId, 0)
    fScore.set(startNodeId, haversineDistance(startCoord, endCoord))
    openSet.enqueue(startNodeId, fScore.get(startNodeId)!)

    const visited = new Set<string>()

    while (!openSet.isEmpty()) {
        const current = openSet.dequeue()!

        if (current === endNodeId) {
            // Reconstruct path
            return reconstructPath(graph, cameFrom, current, gScore.get(current)!)
        }

        if (visited.has(current)) {
            continue
        }
        visited.add(current)

        const currentAttrs = graph.getNodeAttributes(current)
        const currentCoord = { lat: currentAttrs.lat, lng: currentAttrs.lng }
        const expectedDir = getExpectedDirection(currentCoord, shapePoints)

        // Explore neighbors
        for (const neighbor of graph.neighbors(current)) {
            // Skip nodes outside corridor
            if (!corridor.has(neighbor)) {
                continue
            }

            if (visited.has(neighbor)) {
                continue
            }

            const neighborAttrs = graph.getNodeAttributes(neighbor)
            const neighborCoord = { lat: neighborAttrs.lat, lng: neighborAttrs.lng }

            // Get edge distance
            const edgeAttrs = graph.getEdgeAttributes(current, neighbor)
            const edgeDistance = edgeAttrs.distance

            // Calculate direction penalty
            const actualDir = calculateDirection(currentCoord, neighborCoord)
            const dirDiff = angularDifference(actualDir, expectedDir)

            // Penalty: 1.0 if aligned, up to (1 + directionPenalty) if perpendicular
            // Higher penalty for going backwards (> π/2 difference)
            let penalty = 1.0
            if (dirDiff > Math.PI / 2) {
                // Going backwards - heavy penalty
                penalty = 1.0 + directionPenalty * 2
            } else {
                // Scale penalty based on deviation (0 to π/2 -> 1.0 to 1+penalty)
                penalty = 1.0 + directionPenalty * (dirDiff / (Math.PI / 2))
            }

            const tentativeG = gScore.get(current)! + edgeDistance * penalty

            if (!gScore.has(neighbor) || tentativeG < gScore.get(neighbor)!) {
                cameFrom.set(neighbor, current)
                gScore.set(neighbor, tentativeG)

                // Heuristic: straight-line distance to goal
                const h = haversineDistance(neighborCoord, endCoord)
                fScore.set(neighbor, tentativeG + h)

                openSet.enqueue(neighbor, fScore.get(neighbor)!)
            }
        }
    }

    // No path found
    return null
}

/**
 * Reconstruct path from A* search
 */
function reconstructPath(
    graph: StreetGraph,
    cameFrom: Map<string, string>,
    endNode: string,
    totalCost: number
): RoutePath {
    const nodeIds: string[] = [endNode]
    let current = endNode

    while (cameFrom.has(current)) {
        current = cameFrom.get(current)!
        nodeIds.unshift(current)
    }

    // Get coordinates
    const coordinates: Coordinate[] = nodeIds.map(nodeId => {
        const attrs = graph.getNodeAttributes(nodeId)
        return { lat: attrs.lat, lng: attrs.lng }
    })

    // Calculate actual distance (without penalties)
    let actualDistance = 0
    for (let i = 0; i < nodeIds.length - 1; i++) {
        const edgeAttrs = graph.getEdgeAttributes(nodeIds[i], nodeIds[i + 1])
        actualDistance += edgeAttrs.distance
    }

    return {
        nodeIds,
        coordinates,
        distance: actualDistance
    }
}

/**
 * Route through all waypoints using curve-following algorithm
 */
export function routeShapeWithCurveFollowing(
    graph: StreetGraph,
    waypoints: Coordinate[],
    shapePoints: Coordinate[],
    findNearestNode: (coord: Coordinate) => { nodeId: string; distance: number } | null,
    options: {
        corridorWidth?: number
        directionPenalty?: number
        closeLoop?: boolean
        onProgress?: (current: number, total: number) => void
    } = {}
): RoutePath[] | null {
    const {
        corridorWidth = 200,
        directionPenalty = 0.5,
        closeLoop = true,
        onProgress
    } = options

    if (waypoints.length < 2) {
        console.error('Need at least 2 waypoints')
        return null
    }

    console.log(`🎯 Curve-following routing through ${waypoints.length} waypoints`)
    console.log(`   Corridor width: ${corridorWidth}m`)
    console.log(`   Direction penalty: ${directionPenalty}`)

    // Pre-compute corridor nodes (one time for all segments)
    console.log('📦 Building corridor...')
    const corridorNodes = findNodesInCorridor(graph, shapePoints, corridorWidth)
    console.log(`   ${corridorNodes.size} nodes in corridor`)

    // Snap waypoints to nodes
    const waypointNodes: string[] = []
    for (const wp of waypoints) {
        const nearest = findNearestNode(wp)
        if (!nearest) {
            console.error(`Could not find node near waypoint (${wp.lat}, ${wp.lng})`)
            return null
        }
        waypointNodes.push(nearest.nodeId)
    }

    // Route between consecutive waypoints
    const segments: RoutePath[] = []
    const segmentCount = closeLoop ? waypoints.length : waypoints.length - 1

    for (let i = 0; i < segmentCount; i++) {
        const fromNode = waypointNodes[i]
        const toNode = waypointNodes[(i + 1) % waypointNodes.length]

        if (onProgress) {
            onProgress(i + 1, segmentCount)
        }

        console.log(`   Segment ${i + 1}/${segmentCount}: ${fromNode} → ${toNode}`)

        const route = findCurveFollowingRoute(
            graph,
            fromNode,
            toNode,
            shapePoints,
            {
                corridorWidth,
                directionPenalty,
                allowedNodes: corridorNodes
            }
        )

        if (!route) {
            console.warn(`   ⚠️ No route found for segment ${i + 1}`)
            // Try with expanded corridor
            console.log(`   Retrying with expanded corridor...`)
            const expandedCorridor = findNodesInCorridor(graph, shapePoints, corridorWidth * 2)
            const retryRoute = findCurveFollowingRoute(
                graph,
                fromNode,
                toNode,
                shapePoints,
                {
                    corridorWidth: corridorWidth * 2,
                    directionPenalty: directionPenalty * 0.5, // Relax penalty
                    allowedNodes: expandedCorridor
                }
            )

            if (!retryRoute) {
                console.error(`   ❌ Still no route found`)
                continue
            }

            segments.push(retryRoute)
            console.log(`   ✅ Found route with expanded corridor: ${(retryRoute.distance / 1000).toFixed(2)}km`)
        } else {
            segments.push(route)
            console.log(`   ✅ ${(route.distance / 1000).toFixed(2)}km`)
        }
    }

    if (segments.length === 0) {
        console.error('❌ No segments could be routed')
        return null
    }

    const totalDistance = segments.reduce((sum, s) => sum + s.distance, 0)
    console.log(`✅ Routed ${segments.length}/${segmentCount} segments`)
    console.log(`📏 Total distance: ${(totalDistance / 1000).toFixed(2)}km`)

    return segments
}

/**
 * Convert route segments to GeoJSON
 */
export function segmentsToGeoJSON(segments: RoutePath[]) {
    const features = segments.map((segment, index) => ({
        type: 'Feature' as const,
        properties: {
            segmentIndex: index,
            distance: Math.round(segment.distance),
            nodeCount: segment.coordinates.length
        },
        geometry: {
            type: 'LineString' as const,
            coordinates: segment.coordinates.map(c => [c.lng, c.lat])
        }
    }))

    const totalDistance = segments.reduce((sum, s) => sum + s.distance, 0)

    return {
        type: 'FeatureCollection' as const,
        properties: {
            totalDistance,
            totalDistanceKm: (totalDistance / 1000).toFixed(2),
            segmentCount: segments.length,
            nodeCount: segments.reduce((sum, s) => sum + s.coordinates.length, 0)
        },
        features
    }
}
