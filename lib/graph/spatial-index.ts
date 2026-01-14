/**
 * Spatial index for fast nearest-node queries using RBush
 */

import RBush from 'rbush'
import { connectedComponents } from 'graphology-components'
import type { StreetGraph, SpatialIndexItem, Coordinate } from './types'
import { haversineDistance } from './utils'

/**
 * Spatial index wrapper for graph nodes
 */
export class SpatialIndex {
    private tree: RBush<SpatialIndexItem>
    private graph: StreetGraph
    private largestComponentId: number | null = null
    private nodeComponents: Map<string, number> = new Map()

    constructor(graph: StreetGraph, options: { filterToLargestComponent?: boolean } = {}) {
        this.tree = new RBush<SpatialIndexItem>()
        this.graph = graph
        this.buildIndex(options.filterToLargestComponent || false)
    }

    /**
     * Build the spatial index from graph nodes
     */
    private buildIndex(filterToLargestComponent: boolean): void {
        console.log('🔧 Building spatial index...')
        const startTime = Date.now()

        const items: SpatialIndexItem[] = []
        let nodesToIndex: Set<string> | null = null

        if (filterToLargestComponent) {
            // Analyze connected components
            console.log('🔍 Analyzing connected components for spatial index...')
            const componentStart = Date.now()
            const components = connectedComponents(this.graph)

            // components is an array of arrays: [[node1, node2, ...], [node3, node4, ...], ...]
            // Find the largest component (the sub-array with the most nodes)
            let largestComponent: string[] = []
            let maxSize = 0

            for (let i = 0; i < components.length; i++) {
                const componentNodes = components[i]
                if (componentNodes.length > maxSize) {
                    maxSize = componentNodes.length
                    largestComponent = componentNodes
                    this.largestComponentId = i
                }

                // Store component mapping for all nodes
                for (const nodeId of componentNodes) {
                    this.nodeComponents.set(nodeId, i)
                }
            }

            const componentTime = (Date.now() - componentStart) / 1000
            console.log(`✅ Found ${components.length.toLocaleString()} components in ${componentTime.toFixed(2)}s`)
            console.log(`   Largest component: ${maxSize.toLocaleString()} nodes (${((maxSize / this.graph.order) * 100).toFixed(1)}%)`)

            // Create set of nodes in largest component
            nodesToIndex = new Set(largestComponent)
        }

        // Build spatial index
        this.graph.forEachNode((nodeId, attrs) => {
            // Skip if filtering and node not in largest component
            if (nodesToIndex && !nodesToIndex.has(nodeId)) {
                return
            }

            items.push({
                minX: attrs.lng,
                minY: attrs.lat,
                maxX: attrs.lng,
                maxY: attrs.lat,
                nodeId,
                lat: attrs.lat,
                lng: attrs.lng,
            })
        })

        this.tree.load(items)

        const elapsed = (Date.now() - startTime) / 1000
        console.log(`✅ Spatial index built with ${items.length.toLocaleString()} nodes in ${elapsed.toFixed(2)}s`)
    }

    /**
     * Find the nearest node to a coordinate
     */
    findNearest(coord: Coordinate): { nodeId: string; distance: number } | null {
        // Search in a small bounding box first
        const radius = 0.01 // ~1.1km in degrees
        const results = this.tree.search({
            minX: coord.lng - radius,
            minY: coord.lat - radius,
            maxX: coord.lng + radius,
            maxY: coord.lat + radius,
        })

        if (results.length === 0) {
            // Expand search radius
            const expandedRadius = 0.1 // ~11km
            const expandedResults = this.tree.search({
                minX: coord.lng - expandedRadius,
                minY: coord.lat - expandedRadius,
                maxX: coord.lng + expandedRadius,
                maxY: coord.lat + expandedRadius,
            })

            if (expandedResults.length === 0) {
                return null
            }

            return this.findClosestFromResults(coord, expandedResults)
        }

        return this.findClosestFromResults(coord, results)
    }

    /**
     * Find K nearest nodes to a coordinate
     */
    findKNearest(coord: Coordinate, k: number): Array<{ nodeId: string; distance: number }> {
        // Start with a reasonable search radius
        let radius = 0.01 // ~1.1km
        let results: SpatialIndexItem[] = []

        // Expand radius until we have enough results
        while (results.length < k * 2 && radius < 1.0) {
            results = this.tree.search({
                minX: coord.lng - radius,
                minY: coord.lat - radius,
                maxX: coord.lng + radius,
                maxY: coord.lat + radius,
            })

            if (results.length < k * 2) {
                radius *= 2
            }
        }

        // Calculate distances and sort
        const withDistances = results.map((item) => ({
            nodeId: item.nodeId,
            distance: haversineDistance(coord, { lat: item.lat, lng: item.lng }),
        }))

        // Sort by distance and return top K
        withDistances.sort((a, b) => a.distance - b.distance)
        return withDistances.slice(0, k)
    }

    /**
     * Find all nodes within a radius (in meters)
     */
    findWithinRadius(coord: Coordinate, radiusMeters: number): Array<{ nodeId: string; distance: number }> {
        // Convert radius to degrees (approximate)
        const radiusDegrees = radiusMeters / 111000 // 1 degree ≈ 111km

        const results = this.tree.search({
            minX: coord.lng - radiusDegrees,
            minY: coord.lat - radiusDegrees,
            maxX: coord.lng + radiusDegrees,
            maxY: coord.lat + radiusDegrees,
        })

        // Filter by actual distance
        const withDistances = results
            .map((item) => ({
                nodeId: item.nodeId,
                distance: haversineDistance(coord, { lat: item.lat, lng: item.lng }),
            }))
            .filter((item) => item.distance <= radiusMeters)

        // Sort by distance
        withDistances.sort((a, b) => a.distance - b.distance)
        return withDistances
    }

    /**
     * Helper to find closest node from search results
     */
    private findClosestFromResults(
        coord: Coordinate,
        results: SpatialIndexItem[]
    ): { nodeId: string; distance: number } {
        let minDistance = Infinity
        let closestNodeId = results[0].nodeId

        for (const item of results) {
            const distance = haversineDistance(coord, { lat: item.lat, lng: item.lng })
            if (distance < minDistance) {
                minDistance = distance
                closestNodeId = item.nodeId
            }
        }

        return { nodeId: closestNodeId, distance: minDistance }
    }

    /**
     * Get all nodes in a bounding box
     */
    findInBoundingBox(bbox: {
        minLat: number
        maxLat: number
        minLng: number
        maxLng: number
    }): string[] {
        const results = this.tree.search({
            minX: bbox.minLng,
            minY: bbox.minLat,
            maxX: bbox.maxLng,
            maxY: bbox.maxLat,
        })

        return results.map((item) => item.nodeId)
    }
}
