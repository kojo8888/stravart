/**
 * Graph data structure type definitions for street network routing
 */

import type Graph from 'graphology'

/**
 * Geographic coordinate
 */
export interface Coordinate {
    lat: number
    lng: number
}

/**
 * Node in the street network graph
 * Represents an intersection or point along a street
 */
export interface StreetNode {
    id: string
    lat: number
    lng: number
    /** OSM way IDs that this node belongs to */
    ways?: string[]
}

/**
 * Edge in the street network graph
 * Represents a street segment connecting two nodes
 */
export interface StreetEdge {
    /** Distance in meters */
    distance: number
    /** OSM way ID this edge belongs to */
    wayId?: string
    /** Highway type (residential, cycleway, tertiary, etc.) */
    highway?: string
    /** Street name if available */
    name?: string
    /** Surface type if available */
    surface?: string
}

/**
 * GeoJSON Feature from Bavaria streets data
 */
export interface StreetFeature {
    type: 'Feature'
    id?: string | number
    geometry: {
        type: 'LineString'
        coordinates: [number, number][] // [lng, lat] pairs
    }
    properties: {
        '@id'?: string
        highway?: string
        name?: string
        surface?: string
        maxspeed?: string
        [key: string]: any
    }
}

/**
 * GeoJSON FeatureCollection
 */
export interface StreetFeatureCollection {
    type: 'FeatureCollection'
    features: StreetFeature[]
}

/**
 * Graph type with our node and edge attributes
 */
export type StreetGraph = Graph<StreetNode, StreetEdge>

/**
 * Cached graph data structure
 */
export interface CachedGraph {
    /** Serialized graph data */
    graphData: any
    /** Metadata about the cached graph */
    metadata: {
        nodeCount: number
        edgeCount: number
        boundingBox: {
            minLat: number
            maxLat: number
            minLng: number
            maxLng: number
        }
        createdAt: string
        sourceFile: string
    }
}

/**
 * Waypoint for routing
 */
export interface Waypoint {
    lat: number
    lng: number
    /** Optional order/sequence number */
    order?: number
}

/**
 * Route path result from A* pathfinding
 */
export interface RoutePath {
    /** Sequence of node IDs forming the path */
    nodeIds: string[]
    /** Coordinates of the path */
    coordinates: Coordinate[]
    /** Total distance in meters */
    distance: number
}

/**
 * Complete route with multiple waypoints
 */
export interface Route {
    /** All waypoints in order */
    waypoints: Waypoint[]
    /** Path segments connecting waypoints */
    segments: RoutePath[]
    /** Total route distance in meters */
    totalDistance: number
    /** All coordinates in order */
    coordinates: Coordinate[]
}

/**
 * Options for graph building
 */
export interface GraphBuildOptions {
    /** Minimum distance between nodes to merge (meters) */
    mergeThreshold?: number
    /** Progress callback */
    onProgress?: (progress: { processed: number; total: number; phase: string }) => void
}

/**
 * Options for pathfinding
 */
export interface PathfindingOptions {
    /** Maximum search distance in meters */
    maxDistance?: number
    /** Heuristic weight (1.0 = pure A*, 0.0 = Dijkstra) */
    heuristicWeight?: number
}

/**
 * Spatial index item for RBush
 */
export interface SpatialIndexItem {
    minX: number
    minY: number
    maxX: number
    maxY: number
    nodeId: string
    lat: number
    lng: number
}
