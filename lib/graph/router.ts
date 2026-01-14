/**
 * A* pathfinding algorithm for graph routing
 */

import { bidirectional } from 'graphology-shortest-path/unweighted'
import { dijkstra } from 'graphology-shortest-path'
import type { StreetGraph, RoutePath, Coordinate } from './types'
import { haversineDistance } from './utils'

/**
 * Find route between two nodes using A* algorithm
 *
 * @param graph - The street network graph
 * @param startNodeId - Starting node ID
 * @param endNodeId - Ending node ID
 * @returns Route path with coordinates and distance, or null if no path found
 */
export function findRoute(
    graph: StreetGraph,
    startNodeId: string,
    endNodeId: string
): RoutePath | null {
    try {
        // Use Dijkstra's algorithm with distance weights
        // graphology's dijkstra uses edge 'distance' attribute by default
        const path = dijkstra.bidirectional(graph, startNodeId, endNodeId, 'distance')

        if (!path || path.length === 0) {
            return null
        }

        // Convert node IDs to coordinates
        const coordinates: Coordinate[] = path.map((nodeId) => {
            const attrs = graph.getNodeAttributes(nodeId)
            return { lat: attrs.lat, lng: attrs.lng }
        })

        // Calculate total distance
        let totalDistance = 0
        for (let i = 0; i < path.length - 1; i++) {
            const edgeAttrs = graph.getEdgeAttributes(path[i], path[i + 1])
            totalDistance += edgeAttrs.distance
        }

        return {
            nodeIds: path,
            coordinates,
            distance: totalDistance,
        }
    } catch (error) {
        console.error('Error finding route:', error)
        return null
    }
}

/**
 * Find route between two coordinates (not node IDs)
 * Automatically finds nearest nodes to the coordinates
 *
 * @param graph - The street network graph
 * @param spatialIndex - Spatial index for finding nearest nodes
 * @param start - Starting coordinate
 * @param end - Ending coordinate
 * @returns Route path or null if no path found
 */
export function findRouteByCoordinates(
    graph: StreetGraph,
    findNearestNode: (coord: Coordinate) => { nodeId: string; distance: number } | null,
    start: Coordinate,
    end: Coordinate
): RoutePath | null {
    // Find nearest nodes
    const startNode = findNearestNode(start)
    const endNode = findNearestNode(end)

    if (!startNode || !endNode) {
        console.error('Could not find nearest nodes for coordinates')
        return null
    }

    console.log(`Routing from ${startNode.nodeId} to ${endNode.nodeId}`)
    console.log(`  Start snap distance: ${startNode.distance.toFixed(2)}m`)
    console.log(`  End snap distance: ${endNode.distance.toFixed(2)}m`)

    return findRoute(graph, startNode.nodeId, endNode.nodeId)
}

/**
 * Find route with fallback strategies
 * Tries multiple approaches if the primary route fails
 *
 * @param graph - The street network graph
 * @param startNodeId - Starting node ID
 * @param endNodeId - Ending node ID
 * @param options - Routing options
 * @returns Route path or null
 */
export function findRouteSafe(
    graph: StreetGraph,
    startNodeId: string,
    endNodeId: string,
    options: {
        maxDistance?: number
        allowUnconnected?: boolean
    } = {}
): RoutePath | null {
    const { maxDistance = 100000, allowUnconnected = false } = options

    // Check if nodes exist
    if (!graph.hasNode(startNodeId)) {
        console.error(`Start node ${startNodeId} does not exist in graph`)
        return null
    }
    if (!graph.hasNode(endNodeId)) {
        console.error(`End node ${endNodeId} does not exist in graph`)
        return null
    }

    // Check if nodes are the same
    if (startNodeId === endNodeId) {
        const attrs = graph.getNodeAttributes(startNodeId)
        return {
            nodeIds: [startNodeId],
            coordinates: [{ lat: attrs.lat, lng: attrs.lng }],
            distance: 0,
        }
    }

    // Try to find route
    const route = findRoute(graph, startNodeId, endNodeId)

    if (!route) {
        if (allowUnconnected) {
            console.warn('No route found - nodes may be in disconnected components')
            // Return straight line between nodes
            const startAttrs = graph.getNodeAttributes(startNodeId)
            const endAttrs = graph.getNodeAttributes(endNodeId)
            const distance = haversineDistance(
                { lat: startAttrs.lat, lng: startAttrs.lng },
                { lat: endAttrs.lat, lng: endAttrs.lng }
            )

            return {
                nodeIds: [startNodeId, endNodeId],
                coordinates: [
                    { lat: startAttrs.lat, lng: startAttrs.lng },
                    { lat: endAttrs.lat, lng: endAttrs.lng },
                ],
                distance,
            }
        }
        return null
    }

    // Check if route exceeds max distance
    if (route.distance > maxDistance) {
        console.warn(
            `Route distance ${route.distance.toFixed(0)}m exceeds max ${maxDistance}m`
        )
        return null
    }

    return route
}

/**
 * Calculate route statistics
 */
export function getRouteStats(route: RoutePath) {
    return {
        nodes: route.nodeIds.length,
        distance: route.distance,
        distanceKm: (route.distance / 1000).toFixed(2),
        avgSegmentLength: (route.distance / (route.nodeIds.length - 1)).toFixed(2),
    }
}

/**
 * Check if two nodes are in the same connected component
 * Uses BFS to check connectivity
 */
export function areNodesConnected(
    graph: StreetGraph,
    nodeId1: string,
    nodeId2: string
): boolean {
    if (!graph.hasNode(nodeId1) || !graph.hasNode(nodeId2)) {
        return false
    }

    if (nodeId1 === nodeId2) {
        return true
    }

    // BFS to check if we can reach nodeId2 from nodeId1
    const visited = new Set<string>()
    const queue: string[] = [nodeId1]
    visited.add(nodeId1)

    while (queue.length > 0) {
        const current = queue.shift()!

        if (current === nodeId2) {
            return true
        }

        // Add unvisited neighbors to queue
        for (const neighbor of graph.neighbors(current)) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor)
                queue.push(neighbor)
            }
        }

        // Stop if we've searched too many nodes (optimization)
        if (visited.size > 10000) {
            break
        }
    }

    return false
}
