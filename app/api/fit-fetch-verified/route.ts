import { NextResponse } from 'next/server'
import path from 'path'
import { buildGraphFromGeoJSON } from '@/lib/graph/builder'
import { SpatialIndex } from '@/lib/graph/spatial-index'
import type { StreetGraph } from '@/lib/graph/types'
import { generateShapePoints, normalizeShape, getShape } from '@/lib/shapes'
import RBush from 'rbush'
import knn from 'rbush-knn'
import distance from '@turf/distance'

// ========================================
// GRAPH CACHING - Graph is loaded once and kept in memory
// ========================================
let graphCache: StreetGraph | null = null
let spatialIndexCache: SpatialIndex | null = null
let buildPromise: Promise<{ graph: StreetGraph; spatialIndex: SpatialIndex }> | null = null

const GEOJSON_PATH = path.join(process.cwd(), 'fixtures/munich-streets.geojson')

/**
 * Load graph and spatial index (cached after first load)
 */
async function getGraph() {
    // If already loaded, return immediately
    if (graphCache && spatialIndexCache) {
        return { graph: graphCache, spatialIndex: spatialIndexCache }
    }

    // If currently building, wait for it
    if (buildPromise) {
        return await buildPromise
    }

    // Start building
    buildPromise = (async () => {
        console.log('🔧 [FIT-FETCH-VERIFIED] Building graph for connectivity verification...')
        const startTime = Date.now()

        try {
            // Build graph from GeoJSON
            const graph = await buildGraphFromGeoJSON(GEOJSON_PATH, {
                mergeThreshold: 20, // 20m node clustering
            })

            // Build spatial index with component filtering
            const spatialIndex = new SpatialIndex(graph, {
                filterToLargestComponent: true,
            })

            const elapsed = (Date.now() - startTime) / 1000
            console.log(`✅ [FIT-FETCH-VERIFIED] Graph loaded (${elapsed.toFixed(1)}s)`)
            console.log(`   - Nodes: ${graph.order.toLocaleString()}`)
            console.log(`   - Edges: ${graph.size.toLocaleString()}`)

            // Cache for future requests
            graphCache = graph
            spatialIndexCache = spatialIndex

            return { graph, spatialIndex }
        } catch (error) {
            console.error('❌ [FIT-FETCH-VERIFIED] Failed to build graph:', error)
            buildPromise = null // Reset so it can be retried
            throw error
        }
    })()

    return await buildPromise
}

/**
 * Shape transformation functions (from optimization approach)
 */
function transformShape(shape: number[][], [scale, theta, tx, ty]: number[]): number[][] {
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    return shape.map(([x, y]) => [
        scale * (x * cos - y * sin) + tx,
        scale * (x * sin + y * cos) + ty,
    ])
}

/**
 * Snap points to nearest nodes using spatial index
 */
function snapPointsToNodesWithIndex(
    points: number[][],
    spatialIndex: SpatialIndex,
    graph: StreetGraph
): Array<{ lng: number; lat: number; nodeId: string; isConnected: boolean }> {
    return points.map(([lng, lat]) => {
        const nearest = spatialIndex.findNearest({ lat, lng })

        if (!nearest) {
            return { lng, lat, nodeId: '', isConnected: false }
        }

        const nodeAttrs = graph.getNodeAttributes(nearest.nodeId)

        // Node is connected if it's in the spatial index (which filters to largest component)
        return {
            lng: nodeAttrs.lng,
            lat: nodeAttrs.lat,
            nodeId: nearest.nodeId,
            isConnected: true,
        }
    })
}

/**
 * Snap points to nearest nodes using RBush (for non-graph verification)
 */
function snapPointsToNodesBasic(points: number[][], rawNodes: number[][]): number[][] {
    type RBushItem = {
        minX: number
        minY: number
        maxX: number
        maxY: number
        lon: number
        lat: number
    }

    const items: RBushItem[] = rawNodes.map(([lon, lat]) => ({
        minX: lon,
        minY: lat,
        maxX: lon,
        maxY: lat,
        lon,
        lat,
    }))

    const index = new RBush<RBushItem>()
    index.load(items)

    return points.map(([lon, lat]) => {
        const [nearest] = knn(index, lon, lat, 1) as RBushItem[]
        return [nearest.lon, nearest.lat]
    })
}

/**
 * Calculate total route distance
 */
function calculateRouteDistance(coordinates: number[][]): number {
    if (coordinates.length < 2) return 0

    let totalDistance = 0
    for (let i = 0; i < coordinates.length - 1; i++) {
        const from = coordinates[i]
        const to = coordinates[i + 1]
        totalDistance += distance(from, to, { units: 'kilometers' })
    }

    // Add distance from last point back to first to complete the loop
    if (coordinates.length > 2) {
        totalDistance += distance(
            coordinates[coordinates.length - 1],
            coordinates[0],
            { units: 'kilometers' }
        )
    }

    return Math.round(totalDistance * 100) / 100
}

/**
 * Cost function for optimization
 */
function costFunction(
    params: number[],
    shape: number[][],
    coords: number[][],
    targetDistanceKm: number | null = null
): number {
    const transformed = transformShape(shape, params)

    // Cost 1: Distance to nearest street nodes (shape fitting)
    let shapeFitCost = 0
    for (const [x, y] of transformed) {
        let min = Infinity
        for (const [lon, lat] of coords) {
            const dx = x - lon
            const dy = y - lat
            const dist = dx * dx + dy * dy
            if (dist < min) min = dist
        }
        shapeFitCost += min
    }

    // Cost 2: Distance from target distance (if specified)
    let distanceCost = 0
    if (targetDistanceKm) {
        const snapped = snapPointsToNodesBasic(transformed, coords)
        const actualDistance = calculateRouteDistance(snapped)
        const distanceError = Math.abs(actualDistance - targetDistanceKm) / targetDistanceKm
        distanceCost = distanceError * 1000 // Weight distance accuracy heavily
    }

    return shapeFitCost + distanceCost
}

/**
 * Nelder-Mead optimization algorithm
 */
function nelderMead(
    f: (x: number[]) => number,
    x0: number[],
    maxIterations: number = 100
): { x: number[]; fx: number } {
    const alpha = 1,
        gamma = 2,
        rho = 0.5,
        sigma = 0.5
    const n = x0.length
    let simplex = [x0]
    const perturb = [0.005, 0.2, 0.01, 0.01]
    for (let i = 0; i < n; i++) {
        const x = x0.slice()
        x[i] += perturb[i]
        simplex.push(x)
    }

    for (let iter = 0; iter < maxIterations; iter++) {
        simplex.sort((a, b) => f(a) - f(b))
        const centroid = Array(n).fill(0)
        for (let i = 0; i < n; i++)
            for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n

        const worst = simplex[n]
        const reflect = centroid.map((c, i) => c + alpha * (c - worst[i]))
        if (f(reflect) < f(simplex[n - 1])) {
            simplex[n] = reflect
            continue
        }

        const expand = centroid.map((c, i) => c + gamma * (reflect[i] - c))
        if (f(expand) < f(reflect)) {
            simplex[n] = expand
            continue
        }

        const contract = centroid.map((c, i) => c + rho * (worst[i] - c))
        if (f(contract) < f(worst)) {
            simplex[n] = contract
            continue
        }

        for (let i = 1; i <= n; i++)
            simplex[i] = simplex[0].map((v, j) => v + sigma * (simplex[i][j] - v))
    }

    return { x: simplex[0], fx: f(simplex[0]) }
}

/**
 * Fit shape to streets with connectivity verification
 */
async function fitShapeVerified(
    shapeName: string,
    location: { lat: number; lng: number },
    targetDistanceKm: number = 5.0
) {
    console.log(`🎨 [FIT-FETCH-VERIFIED] Fitting ${shapeName} at (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`)

    // Get shape definition and points
    const shapeDefinition = getShape(shapeName)
    if (!shapeDefinition) {
        throw new Error(`Unsupported shape: ${shapeName}`)
    }

    const shapePoints = generateShapePoints(shapeName)
    const shape = normalizeShape(shapePoints)

    // Load graph for connectivity verification
    const { graph, spatialIndex } = await getGraph()

    // Extract all node coordinates from graph for optimization
    const rawNodes: number[][] = []
    graph.forEachNode((nodeId, attrs) => {
        rawNodes.push([attrs.lng, attrs.lat])
    })

    console.log(`📍 Using ${rawNodes.length.toLocaleString()} street nodes for optimization`)

    // Optimization setup
    const degreesPerMeter = 1 / 111000
    const perimeterRatio = shapeDefinition.estimatedPerimeterRatio || 6.0
    const estimatedScale = ((targetDistanceKm * 1000) / perimeterRatio) * degreesPerMeter
    const initialParams = [estimatedScale, 0, location.lng, location.lat]

    // Run optimization
    console.log('🔧 Running Nelder-Mead optimization...')
    let result = nelderMead(
        (params) => costFunction(params, shape, rawNodes, targetDistanceKm),
        initialParams,
        200
    )

    // Iterative refinement to get closer to target distance
    let attempts = 0
    const maxAttempts = 3

    while (attempts < maxAttempts) {
        const transformed = transformShape(shape, result.x)
        const snapped = snapPointsToNodesBasic(transformed, rawNodes)
        const actualDistance = calculateRouteDistance(snapped)
        const distanceError = Math.abs(actualDistance - targetDistanceKm) / targetDistanceKm

        if (distanceError <= 0.2) break

        const scaleAdjustment = targetDistanceKm / actualDistance
        const adjustedParams = [...result.x]
        adjustedParams[0] *= scaleAdjustment

        result = nelderMead(
            (params) => costFunction(params, shape, rawNodes, targetDistanceKm),
            adjustedParams,
            150
        )

        attempts++
    }

    // Transform shape with optimized parameters
    const transformed = transformShape(shape, result.x)

    // Snap to nearest nodes and verify connectivity
    console.log('🔍 Verifying connectivity...')
    const snappedWithConnectivity = snapPointsToNodesWithIndex(transformed, spatialIndex, graph)

    const connectedCount = snappedWithConnectivity.filter((p) => p.isConnected).length
    const totalPoints = snappedWithConnectivity.length
    const connectivityPercentage = (connectedCount / totalPoints) * 100

    console.log(`✅ Connectivity: ${connectedCount}/${totalPoints} points (${connectivityPercentage.toFixed(1)}%)`)

    // Calculate actual route distance
    const coordinates = snappedWithConnectivity.map((p) => [p.lng, p.lat])
    const totalDistance = calculateRouteDistance(coordinates)

    // Build GeoJSON response
    return {
        type: 'FeatureCollection',
        properties: {
            totalDistanceKm: totalDistance,
            pointCount: totalPoints,
            targetDistanceKm: targetDistanceKm,
            connectivity: {
                connectedPoints: connectedCount,
                totalPoints: totalPoints,
                percentage: Math.round(connectivityPercentage * 10) / 10,
                allConnected: connectivityPercentage === 100,
            },
            method: 'optimization-with-verification',
            shape: shapeName,
        },
        features: snappedWithConnectivity.map((point, index) => ({
            type: 'Feature',
            properties: {
                index,
                nodeId: point.nodeId,
                isConnected: point.isConnected,
            },
            geometry: {
                type: 'Point',
                coordinates: [point.lng, point.lat],
            },
        })),
    }
}

/**
 * API Endpoint
 */
export async function POST(req: Request) {
    try {
        const { location, shape, targetDistanceKm = 5.0 } = await req.json()

        // Validate location
        if (
            !location ||
            typeof location.lat !== 'number' ||
            typeof location.lng !== 'number'
        ) {
            return NextResponse.json(
                { error: 'Invalid location: lat and lng must be numbers' },
                { status: 400 }
            )
        }

        // Validate shape
        if (!shape || typeof shape !== 'string') {
            return NextResponse.json(
                { error: 'Invalid shape: must be a string' },
                { status: 400 }
            )
        }

        // Validate target distance
        if (targetDistanceKm < 1 || targetDistanceKm > 50) {
            return NextResponse.json(
                {
                    error: 'Invalid target distance',
                    message: 'Target distance must be between 1 and 50 km',
                },
                { status: 400 }
            )
        }

        const result = await fitShapeVerified(shape.trim(), location, targetDistanceKm)
        return NextResponse.json(result)
    } catch (err: any) {
        console.error('[FIT-FETCH-VERIFIED ERROR]', err)
        return NextResponse.json(
            {
                error: err.message || 'Internal Server Error',
                stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
            },
            { status: 500 }
        )
    }
}

/**
 * GET endpoint for health check
 */
export async function GET() {
    const isGraphLoaded = graphCache !== null && spatialIndexCache !== null

    return NextResponse.json({
        service: 'fit-fetch-with-connectivity-verification',
        status: isGraphLoaded ? 'ready' : 'not-loaded',
        description: 'Optimization-based shape fitting with graph connectivity verification',
        supportedRegion: 'Munich, Germany (20km radius)',
        info: 'Graph will be loaded on first route request (takes ~10-15s for Munich)',
    })
}
