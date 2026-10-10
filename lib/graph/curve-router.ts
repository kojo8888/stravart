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
 * Blend two directions with a weight
 * @param dir1 First direction (radians)
 * @param dir2 Second direction (radians)
 * @param weight Weight for dir1 (0-1), dir2 gets (1-weight)
 * @returns Blended direction
 */
function blendDirections(dir1: number, dir2: number, weight: number): number {
    // Convert to unit vectors
    const x1 = Math.cos(dir1), y1 = Math.sin(dir1)
    const x2 = Math.cos(dir2), y2 = Math.sin(dir2)

    // Weighted blend
    const x = x1 * weight + x2 * (1 - weight)
    const y = y1 * weight + y2 * (1 - weight)

    // Convert back to angle
    return Math.atan2(y, x)
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

        // Use goal direction as the primary expected direction
        // This guides routing towards the destination while corridor keeps it near shape
        const goalDir = calculateDirection(currentCoord, endCoord)
        // Also consider shape tangent for smoothness
        const shapeDir = getExpectedDirection(currentCoord, shapePoints)
        // Blend: prioritize goal direction but consider shape tangent
        // This helps follow the shape while making progress toward goal
        const blendedExpectedDir = blendDirections(goalDir, shapeDir, 0.7)  // 70% goal, 30% shape

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
            const dirDiff = angularDifference(actualDir, blendedExpectedDir)

            // Strong penalty system to prevent U-turns and backtracking:
            // - Aligned with shape: penalty = 1.0 (no penalty)
            // - Up to 45° off: gradual penalty up to 1.5x
            // - 45-90° off: steeper penalty up to 3x
            // - 90-135° off: heavy penalty up to 5x
            // - >135° off (nearly backward): extreme exponential penalty
            let penalty = 1.0
            if (dirDiff > Math.PI * 0.75) {
                // Going mostly backward (>135°) - extreme exponential penalty
                // This makes backward movement essentially impossible
                penalty = 5.0 + (dirDiff - Math.PI * 0.75) * 12.0
            } else if (dirDiff > Math.PI / 2) {
                // Going backward (90-135°) - heavy penalty
                penalty = 3.0 + directionPenalty * 4 * ((dirDiff - Math.PI / 2) / (Math.PI / 4))
            } else if (dirDiff > Math.PI / 4) {
                // Significantly off (45-90°) - moderate penalty
                penalty = 1.5 + directionPenalty * 3 * ((dirDiff - Math.PI / 4) / (Math.PI / 4))
            } else {
                // Forward-ish (0-45°) - gradual penalty
                penalty = 1.0 + directionPenalty * (dirDiff / (Math.PI / 4))
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
 * Unconstrained A* routing (fallback when corridor routing fails)
 * No corridor or direction constraints - just find any path
 */
export function findUnconstrainedRoute(
    graph: StreetGraph,
    startNodeId: string,
    endNodeId: string
): RoutePath | null {
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
            return reconstructPath(graph, cameFrom, current, gScore.get(current)!)
        }

        if (visited.has(current)) continue
        visited.add(current)

        const currentAttrs = graph.getNodeAttributes(current)
        const currentCoord = { lat: currentAttrs.lat, lng: currentAttrs.lng }

        for (const neighbor of graph.neighbors(current)) {
            if (visited.has(neighbor)) continue

            const edgeAttrs = graph.getEdgeAttributes(current, neighbor)
            const tentativeG = gScore.get(current)! + edgeAttrs.distance

            if (!gScore.has(neighbor) || tentativeG < gScore.get(neighbor)!) {
                cameFrom.set(neighbor, current)
                gScore.set(neighbor, tentativeG)

                const neighborAttrs = graph.getNodeAttributes(neighbor)
                const neighborCoord = { lat: neighborAttrs.lat, lng: neighborAttrs.lng }
                const h = haversineDistance(neighborCoord, endCoord)
                fScore.set(neighbor, tentativeG + h)

                openSet.enqueue(neighbor, fScore.get(neighbor)!)
            }
        }
    }

    return null
}

/**
 * Check if a node is a dead-end (degree 1) or near-dead-end (degree 2 with one being same street)
 */
function isDeadEndNode(graph: StreetGraph, nodeId: string): boolean {
    const degree = graph.degree(nodeId)
    return degree <= 1
}

/**
 * Find a good snap point that avoids dead-ends
 */
function findBestSnapNode(
    graph: StreetGraph,
    candidates: Array<{ nodeId: string; distance: number }>,
    corridorNodes: Set<string>
): { nodeId: string; distance: number } | null {
    // First pass: find candidates that are not dead-ends and in corridor
    for (const candidate of candidates) {
        if (!isDeadEndNode(graph, candidate.nodeId) && corridorNodes.has(candidate.nodeId)) {
            return candidate
        }
    }

    // Second pass: find any non-dead-end
    for (const candidate of candidates) {
        if (!isDeadEndNode(graph, candidate.nodeId)) {
            return candidate
        }
    }

    // Fallback: return closest even if dead-end
    return candidates[0] || null
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
        findKNearestNodes?: (coord: Coordinate, k: number) => Array<{ nodeId: string; distance: number }>
    } = {}
): RoutePath[] | null {
    const {
        corridorWidth = 200,
        directionPenalty = 0.5,
        closeLoop = true,
        onProgress,
        findKNearestNodes
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

    // Snap waypoints to nodes - prefer nodes within corridor and NOT dead-ends
    console.log('📍 Snapping waypoints to street network (avoiding dead-ends)...')
    const waypointNodes: string[] = []
    const snapDistances: number[] = []
    let farSnaps = 0
    let outOfCorridorSnaps = 0
    let deadEndsAvoided = 0

    for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i]

        let selectedNode: { nodeId: string; distance: number } | null = null

        // If we have access to K-nearest, use it to find non-dead-end nodes
        if (findKNearestNodes) {
            const candidates = findKNearestNodes(wp, 8) // Get 8 nearest candidates
            const nearest = candidates[0]

            if (nearest && isDeadEndNode(graph, nearest.nodeId)) {
                // Nearest is a dead-end, find a better option
                const better = findBestSnapNode(graph, candidates, corridorNodes)
                if (better && better.nodeId !== nearest.nodeId) {
                    console.log(`   🔄 WP${i + 1}: Avoided dead-end, using node ${better.distance.toFixed(0)}m away instead of ${nearest.distance.toFixed(0)}m`)
                    selectedNode = better
                    deadEndsAvoided++
                } else {
                    selectedNode = nearest
                }
            } else {
                selectedNode = nearest
            }
        } else {
            selectedNode = findNearestNode(wp)
        }

        if (!selectedNode) {
            console.error(`Could not find node near waypoint ${i + 1} (${wp.lat}, ${wp.lng})`)
            return null
        }

        // Check if snapped node is in corridor
        const isInCorridor = corridorNodes.has(selectedNode.nodeId)
        if (!isInCorridor) {
            outOfCorridorSnaps++
            // Add the node to corridor anyway so routing can reach it
            corridorNodes.add(selectedNode.nodeId)
        }

        // Track snap distances
        snapDistances.push(selectedNode.distance)
        if (selectedNode.distance > 200) { // More than 200m snap
            farSnaps++
            console.log(`   ⚠️ WP${i + 1}: snapped ${selectedNode.distance.toFixed(0)}m to ${selectedNode.nodeId}${!isInCorridor ? ' (outside corridor!)' : ''}`)
        }

        waypointNodes.push(selectedNode.nodeId)
    }

    if (deadEndsAvoided > 0) {
        console.log(`   ✅ Avoided ${deadEndsAvoided} dead-end nodes`)
    }

    // Summary of snapping quality
    const avgSnapDistance = snapDistances.reduce((a, b) => a + b, 0) / snapDistances.length
    const maxSnapDistance = Math.max(...snapDistances)
    console.log(`   Avg snap: ${avgSnapDistance.toFixed(0)}m, Max: ${maxSnapDistance.toFixed(0)}m`)
    if (farSnaps > 0) {
        console.log(`   ⚠️ ${farSnaps} waypoints snapped >200m from ideal position`)
    }
    if (outOfCorridorSnaps > 0) {
        console.log(`   ⚠️ ${outOfCorridorSnaps} waypoints snapped to nodes outside original corridor`)
    }

    // Check for duplicate consecutive nodes (would cause 0-length segments)
    let duplicateNodes = 0
    for (let i = 0; i < waypointNodes.length; i++) {
        const nextIdx = (i + 1) % waypointNodes.length
        if (waypointNodes[i] === waypointNodes[nextIdx]) {
            duplicateNodes++
            console.log(`   ⚠️ WP${i + 1} and WP${nextIdx + 1} snapped to same node: ${waypointNodes[i]}`)
        }
    }
    if (duplicateNodes > 0) {
        console.log(`   ⚠️ ${duplicateNodes} consecutive waypoints share the same node`)
    }

    // Handle very close waypoints (e.g., at heart's sharp point)
    // If two consecutive waypoints are < 50m apart but snapped to different nodes,
    // check if those nodes are adjacent in the graph. If not, snap the second
    // waypoint to the same node to avoid unnecessary detours.
    const CLOSE_WAYPOINT_THRESHOLD = 50 // meters
    let closeWaypointsFixed = 0

    for (let i = 0; i < waypointNodes.length; i++) {
        const nextIdx = (i + 1) % waypointNodes.length
        const waypointDistance = haversineDistance(waypoints[i], waypoints[nextIdx])

        if (waypointDistance < CLOSE_WAYPOINT_THRESHOLD && waypointNodes[i] !== waypointNodes[nextIdx]) {
            // Get the snapped node positions
            const node1Attrs = graph.getNodeAttributes(waypointNodes[i])
            const node2Attrs = graph.getNodeAttributes(waypointNodes[nextIdx])
            const snappedNodeDistance = haversineDistance(
                { lat: node1Attrs.lat, lng: node1Attrs.lng },
                { lat: node2Attrs.lat, lng: node2Attrs.lng }
            )

            // Check if the snapped nodes are adjacent
            const areAdjacent = graph.hasEdge(waypointNodes[i], waypointNodes[nextIdx])

            console.log(`   🔍 Close waypoints WP${i + 1}→WP${nextIdx + 1}: WP dist=${waypointDistance.toFixed(0)}m, node dist=${snappedNodeDistance.toFixed(0)}m, adjacent=${areAdjacent}`)

            // Merge if nodes are far apart OR if the snapped node distance is much larger than waypoint distance
            // (even if adjacent, we want to avoid detours)
            if (!areAdjacent || snappedNodeDistance > waypointDistance * 3) {
                console.log(`   🔧 Merging: WP${nextIdx + 1} → same node as WP${i + 1}`)
                waypointNodes[nextIdx] = waypointNodes[i]
                closeWaypointsFixed++
            }
        }
    }

    if (closeWaypointsFixed > 0) {
        console.log(`   🔧 Fixed ${closeWaypointsFixed} close waypoint pairs to avoid detours`)
    }

    // Route between consecutive waypoints
    const segments: RoutePath[] = []
    const segmentCount = closeLoop ? waypoints.length : waypoints.length - 1

    for (let i = 0; i < segmentCount; i++) {
        const fromNode = waypointNodes[i]
        const toNode = waypointNodes[(i + 1) % waypointNodes.length]
        const nextWpIdx = (i + 1) % waypoints.length

        // Calculate straight-line distance between waypoints for comparison
        const straightLineDistance = haversineDistance(waypoints[i], waypoints[nextWpIdx])

        if (onProgress) {
            onProgress(i + 1, segmentCount)
        }

        // Skip routing if start and end are the same node (merged close waypoints)
        if (fromNode === toNode) {
            console.log(`   Segment ${i + 1}/${segmentCount}: WP${i + 1}→WP${nextWpIdx + 1} - skipped (same node)`)
            continue
        }

        console.log(`   Segment ${i + 1}/${segmentCount}: WP${i + 1}→WP${nextWpIdx + 1} (straight: ${(straightLineDistance / 1000).toFixed(2)}km)`)

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

            // Fallback 1: Try with slightly expanded corridor (1.5x) but KEEP direction penalty
            console.log(`   Retrying with 1.5x corridor (maintaining direction constraint)...`)
            let expandedCorridor = findNodesInCorridor(graph, shapePoints, corridorWidth * 1.5)
            let retryRoute = findCurveFollowingRoute(
                graph,
                fromNode,
                toNode,
                shapePoints,
                {
                    corridorWidth: corridorWidth * 1.5,
                    directionPenalty: directionPenalty,  // Keep strong direction penalty
                    allowedNodes: expandedCorridor
                }
            )

            // Fallback 2: Try with 2x corridor, slightly reduced penalty
            if (!retryRoute) {
                console.log(`   Retrying with 2x corridor...`)
                expandedCorridor = findNodesInCorridor(graph, shapePoints, corridorWidth * 2)
                retryRoute = findCurveFollowingRoute(
                    graph,
                    fromNode,
                    toNode,
                    shapePoints,
                    {
                        corridorWidth: corridorWidth * 2,
                        directionPenalty: directionPenalty * 0.8,  // Only slightly reduced
                        allowedNodes: expandedCorridor
                    }
                )
            }

            // Fallback 3: Try with 3x corridor
            if (!retryRoute) {
                console.log(`   Retrying with 3x corridor...`)
                expandedCorridor = findNodesInCorridor(graph, shapePoints, corridorWidth * 3)
                retryRoute = findCurveFollowingRoute(
                    graph,
                    fromNode,
                    toNode,
                    shapePoints,
                    {
                        corridorWidth: corridorWidth * 3,
                        directionPenalty: directionPenalty * 0.6,  // Moderately reduced
                        allowedNodes: expandedCorridor
                    }
                )
            }

            // Fallback 4: Try unconstrained routing only as last resort
            if (!retryRoute) {
                console.log(`   Retrying with unconstrained routing...`)
                retryRoute = findUnconstrainedRoute(graph, fromNode, toNode)
            }

            if (!retryRoute) {
                console.error(`   ❌ All fallbacks failed for segment ${i + 1}`)
                // Create a direct connection as last resort
                const fromAttrs = graph.getNodeAttributes(fromNode)
                const toAttrs = graph.getNodeAttributes(toNode)
                const directDistance = haversineDistance(
                    { lat: fromAttrs.lat, lng: fromAttrs.lng },
                    { lat: toAttrs.lat, lng: toAttrs.lng }
                )

                // Add a "gap" segment that just connects the two points directly
                // This prevents holes but will show as a straight line
                segments.push({
                    nodeIds: [fromNode, toNode],
                    coordinates: [
                        { lat: fromAttrs.lat, lng: fromAttrs.lng },
                        { lat: toAttrs.lat, lng: toAttrs.lng }
                    ],
                    distance: directDistance
                })
                console.log(`   ⚠️ Added direct connection (gap): ${(directDistance / 1000).toFixed(2)}km`)
                continue
            }

            segments.push(retryRoute)
            const detourRatio = retryRoute.distance / straightLineDistance
            console.log(`   ✅ Found route with fallback: ${(retryRoute.distance / 1000).toFixed(2)}km (${detourRatio.toFixed(1)}x straight-line)`)
            if (detourRatio > 5) {
                console.log(`   ⚠️ SUSPICIOUS: segment ${i + 1} is ${detourRatio.toFixed(1)}x the straight-line distance!`)
            }
        } else {
            segments.push(route)
            const detourRatio = route.distance / straightLineDistance
            console.log(`   ✅ ${(route.distance / 1000).toFixed(2)}km (${detourRatio.toFixed(1)}x straight-line, ${route.nodeIds.length} nodes)`)
            if (detourRatio > 5) {
                console.log(`   ⚠️ SUSPICIOUS: segment ${i + 1} is ${detourRatio.toFixed(1)}x the straight-line distance!`)
            }
        }
    }

    if (segments.length === 0) {
        console.error('❌ No segments could be routed')
        return null
    }

    // Post-process: Remove backtracking and detect U-turns
    console.log('🔄 Post-processing: Detecting backtracking and U-turns...')
    let totalUTurns = 0
    const cleanedSegments = segments.map((segment, segIdx) => {
        const cleaned = removeBacktracking(segment)
        if (cleaned.distance < segment.distance) {
            const saved = segment.distance - cleaned.distance
            console.log(`   Segment ${segIdx + 1}: Removed ${(saved / 1000).toFixed(2)}km backtracking`)
        }

        // Detect remaining U-turns
        const uturns = detectUTurns(cleaned)
        if (uturns > 0) {
            console.log(`   ⚠️ Segment ${segIdx + 1}: ${uturns} U-turn(s) detected`)
            totalUTurns += uturns
        }

        return cleaned
    })

    const totalDistance = cleanedSegments.reduce((sum, s) => sum + s.distance, 0)
    const originalDistance = segments.reduce((sum, s) => sum + s.distance, 0)

    if (totalDistance < originalDistance) {
        console.log(`   ✅ Removed ${((originalDistance - totalDistance) / 1000).toFixed(2)}km total backtracking`)
    }

    if (totalUTurns > 0) {
        console.log(`   ⚠️ Total U-turns detected: ${totalUTurns}`)
    } else {
        console.log(`   ✅ No U-turns detected`)
    }

    console.log(`✅ Routed ${cleanedSegments.length}/${segmentCount} segments`)
    console.log(`📏 Total distance: ${(totalDistance / 1000).toFixed(2)}km`)

    return cleanedSegments
}

/**
 * Remove backtracking from a route segment
 * Detects when a route visits a node twice (goes down a street and returns)
 * and short-circuits to remove the backtracking portion
 */
function removeBacktracking(segment: RoutePath): RoutePath {
    const { nodeIds, coordinates, distance } = segment

    if (nodeIds.length <= 2) {
        return segment
    }

    // Find nodes that appear more than once
    const nodeFirstIndex = new Map<string, number>()
    const duplicates: Array<{ nodeId: string; firstIdx: number; secondIdx: number }> = []

    for (let i = 0; i < nodeIds.length; i++) {
        const nodeId = nodeIds[i]
        if (nodeFirstIndex.has(nodeId)) {
            duplicates.push({
                nodeId,
                firstIdx: nodeFirstIndex.get(nodeId)!,
                secondIdx: i
            })
        } else {
            nodeFirstIndex.set(nodeId, i)
        }
    }

    if (duplicates.length === 0) {
        return segment // No backtracking detected
    }

    // Remove the largest backtracking segment first
    // Sort by size of backtracking (secondIdx - firstIdx)
    duplicates.sort((a, b) => (b.secondIdx - b.firstIdx) - (a.secondIdx - a.firstIdx))

    // Remove the backtracking: keep nodes before firstIdx, then skip to secondIdx
    const duplicate = duplicates[0]
    const newNodeIds = [
        ...nodeIds.slice(0, duplicate.firstIdx + 1),
        ...nodeIds.slice(duplicate.secondIdx + 1)
    ]
    const newCoordinates = [
        ...coordinates.slice(0, duplicate.firstIdx + 1),
        ...coordinates.slice(duplicate.secondIdx + 1)
    ]

    // Recalculate distance
    let newDistance = 0
    for (let i = 0; i < newCoordinates.length - 1; i++) {
        newDistance += haversineDistance(newCoordinates[i], newCoordinates[i + 1])
    }

    const result: RoutePath = {
        nodeIds: newNodeIds,
        coordinates: newCoordinates,
        distance: newDistance
    }

    // Recursively remove more backtracking if present
    if (duplicates.length > 1) {
        return removeBacktracking(result)
    }

    return result
}

/**
 * Detect U-turns in a route segment
 * A U-turn is when we detect a reversal of direction:
 * - A single sharp turn >150° (near-reversal)
 * - Two consecutive sharp turns (>90° each) in same rotational direction
 * Returns the count of detected U-turns
 */
export function detectUTurns(segment: RoutePath): number {
    const { coordinates } = segment

    if (coordinates.length < 3) {
        return 0
    }

    let uTurnCount = 0
    const SHARP_SINGLE_TURN = Math.PI * 5 / 6 // 150° single turn threshold
    const DOUBLE_TURN_EACH = Math.PI / 2 // 90° for consecutive double-turn detection

    for (let i = 0; i < coordinates.length - 2; i++) {
        // Calculate direction of edge i→i+1
        const dir1 = calculateDirection(coordinates[i], coordinates[i + 1])
        // Calculate direction of edge i+1→i+2
        const dir2 = calculateDirection(coordinates[i + 1], coordinates[i + 2])

        // Single sharp turn detection (near U-turn)
        const singleTurn = angularDifference(dir1, dir2)
        if (singleTurn > SHARP_SINGLE_TURN) {
            uTurnCount++
            continue // Skip to avoid double-counting
        }

        // Double-turn detection: two consecutive 90°+ turns
        if (i < coordinates.length - 3 && singleTurn > DOUBLE_TURN_EACH) {
            const dir3 = calculateDirection(coordinates[i + 2], coordinates[i + 3])
            const secondTurn = angularDifference(dir2, dir3)
            if (secondTurn > DOUBLE_TURN_EACH) {
                // Two consecutive sharp turns - likely a U-turn pattern
                uTurnCount++
            }
        }
    }

    return uTurnCount
}

/**
 * Calculate shape deviation - how far the route deviates from the ideal shape outline
 * Returns average deviation in meters
 */
export function calculateShapeDeviation(
    segment: RoutePath,
    shapePoints: Coordinate[]
): number {
    const { coordinates } = segment

    if (coordinates.length === 0 || shapePoints.length === 0) {
        return 0
    }

    let totalDeviation = 0
    for (const coord of coordinates) {
        const deviation = distanceToShapeOutline(coord, shapePoints)
        totalDeviation += deviation
    }

    return totalDeviation / coordinates.length
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
