/**
 * Dynamic OSM data fetcher for graph-based routing
 * Fetches street network data from Overpass API for a specific bounding box
 */

import { buildGraphFromGeoJSON } from './builder'
import { SpatialIndex } from './spatial-index'
import type { StreetGraph } from './types'

// Highway types suitable for cycling/running routes
const HIGHWAY_TYPES = [
    'residential',
    'cycleway',
    'tertiary',
    'unclassified',
    'service',
    'living_street',
    'pedestrian',
    'track',
    'path',
    'footway',
    'secondary',  // Include for connectivity
    'primary',    // Include for connectivity (will prefer smaller roads in routing)
]

interface BBox {
    south: number
    west: number
    north: number
    east: number
}

interface CacheEntry {
    graph: StreetGraph
    spatialIndex: SpatialIndex
    timestamp: number
    bbox: BBox
}

// In-memory cache for fetched graphs
// Key: "south,west,north,east" rounded to 3 decimal places
const graphCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 30 * 60 * 1000  // 30 minutes

/**
 * Generate cache key from bbox (rounded to ~100m precision)
 */
function getCacheKey(bbox: BBox): string {
    return [
        bbox.south.toFixed(3),
        bbox.west.toFixed(3),
        bbox.north.toFixed(3),
        bbox.east.toFixed(3)
    ].join(',')
}

/**
 * Check if a cached entry covers the requested bbox
 */
function findCoveringCache(bbox: BBox): CacheEntry | null {
    const now = Date.now()

    for (const [key, entry] of graphCache.entries()) {
        // Check if cache is expired
        if (now - entry.timestamp > CACHE_TTL_MS) {
            graphCache.delete(key)
            continue
        }

        // Check if cached bbox fully contains requested bbox
        if (entry.bbox.south <= bbox.south &&
            entry.bbox.west <= bbox.west &&
            entry.bbox.north >= bbox.north &&
            entry.bbox.east >= bbox.east) {
            console.log(`📦 [OSM] Cache hit for bbox`)
            return entry
        }
    }

    return null
}

/**
 * Build Overpass QL query for fetching street network
 */
function buildOverpassQuery(bbox: BBox): string {
    const { south, west, north, east } = bbox
    const bboxString = `${south},${west},${north},${east}`
    const highwayFilter = HIGHWAY_TYPES.join('|')

    return `
[out:json][timeout:60];
(
  way["highway"~"^(${highwayFilter})$"](${bboxString});
);
out geom;
    `.trim()
}

/**
 * Fetch data from Overpass API
 */
async function fetchFromOverpass(query: string): Promise<any> {
    const url = 'https://overpass-api.de/api/interpreter'

    console.log('🌍 [OSM] Fetching from Overpass API...')
    const startTime = Date.now()

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: query,
    })

    if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`✅ [OSM] Fetched in ${elapsed}s`)

    return data
}

/**
 * Convert Overpass JSON to GeoJSON format
 */
function overpassToGeoJSON(overpassData: any): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = []

    for (const element of overpassData.elements || []) {
        if (element.type === 'way' && element.geometry && element.geometry.length >= 2) {
            const coordinates = element.geometry.map((node: { lon: number; lat: number }) =>
                [node.lon, node.lat]
            )

            features.push({
                type: 'Feature',
                properties: {
                    osmid: element.id,
                    highway: element.tags?.highway || null,
                    name: element.tags?.name || null,
                    surface: element.tags?.surface || null,
                },
                geometry: {
                    type: 'LineString',
                    coordinates,
                }
            })
        }
    }

    console.log(`📊 [OSM] Converted ${features.length} street features`)

    return {
        type: 'FeatureCollection',
        features,
    }
}

/**
 * Calculate bounding box from an array of coordinates with padding
 */
export function calculateBBox(
    coords: Array<{ lat: number; lng: number }>,
    paddingMeters: number = 500
): BBox {
    if (coords.length === 0) {
        throw new Error('Cannot calculate bbox from empty coordinates')
    }

    let minLat = Infinity, maxLat = -Infinity
    let minLng = Infinity, maxLng = -Infinity

    for (const coord of coords) {
        minLat = Math.min(minLat, coord.lat)
        maxLat = Math.max(maxLat, coord.lat)
        minLng = Math.min(minLng, coord.lng)
        maxLng = Math.max(maxLng, coord.lng)
    }

    // Convert padding from meters to degrees (approximate)
    const latPadding = paddingMeters / 111320
    const lngPadding = paddingMeters / (40075000 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180) / 360)

    return {
        south: minLat - latPadding,
        north: maxLat + latPadding,
        west: minLng - lngPadding,
        east: maxLng + lngPadding,
    }
}

/**
 * Fetch street network and build graph for a bounding box
 */
export async function fetchAndBuildGraph(bbox: BBox): Promise<{
    graph: StreetGraph
    spatialIndex: SpatialIndex
    fromCache: boolean
    nodeCount: number
    edgeCount: number
}> {
    // Check cache first
    const cached = findCoveringCache(bbox)
    if (cached) {
        return {
            graph: cached.graph,
            spatialIndex: cached.spatialIndex,
            fromCache: true,
            nodeCount: cached.graph.order,
            edgeCount: cached.graph.size,
        }
    }

    // Add extra padding to cache for reuse
    const paddedBbox: BBox = {
        south: bbox.south - 0.01,  // ~1km extra
        north: bbox.north + 0.01,
        west: bbox.west - 0.01,
        east: bbox.east + 0.01,
    }

    console.log(`📍 [OSM] Fetching bbox: ${paddedBbox.south.toFixed(4)},${paddedBbox.west.toFixed(4)} → ${paddedBbox.north.toFixed(4)},${paddedBbox.east.toFixed(4)}`)

    // Fetch from Overpass
    const query = buildOverpassQuery(paddedBbox)
    const overpassData = await fetchFromOverpass(query)

    // Convert to GeoJSON
    const geojson = overpassToGeoJSON(overpassData)

    if (geojson.features.length === 0) {
        throw new Error('No street data found in this area. Try a different location.')
    }

    // Build graph from GeoJSON (in-memory)
    console.log('🔧 [OSM] Building graph...')
    const graphStart = Date.now()

    const graph = await buildGraphFromGeoJSON(geojson, {
        mergeThreshold: 5,
    })

    const spatialIndex = new SpatialIndex(graph, {
        filterToLargestComponent: true,
    })

    const graphTime = ((Date.now() - graphStart) / 1000).toFixed(1)
    console.log(`✅ [OSM] Graph built in ${graphTime}s (${graph.order} nodes, ${graph.size} edges)`)

    // Cache the result
    const cacheKey = getCacheKey(paddedBbox)
    graphCache.set(cacheKey, {
        graph,
        spatialIndex,
        timestamp: Date.now(),
        bbox: paddedBbox,
    })

    // Limit cache size (keep last 5 entries)
    if (graphCache.size > 5) {
        const oldestKey = graphCache.keys().next().value
        if (oldestKey) graphCache.delete(oldestKey)
    }

    return {
        graph,
        spatialIndex,
        fromCache: false,
        nodeCount: graph.order,
        edgeCount: graph.size,
    }
}

/**
 * Clear the graph cache
 */
export function clearCache(): void {
    graphCache.clear()
    console.log('🗑️ [OSM] Cache cleared')
}

/**
 * Get cache stats
 */
export function getCacheStats(): { entries: number; keys: string[] } {
    return {
        entries: graphCache.size,
        keys: Array.from(graphCache.keys()),
    }
}
