import { NextResponse } from 'next/server'
import RBush from 'rbush'
import knn from 'rbush-knn'
import distance from '@turf/distance'
import { generateShapePoints, normalizeShape, getShape } from '@/lib/shapes'
import { svgToPoints, normalizePoints as normalizeSvgPoints } from '@/lib/svg-parser'
import fs from 'fs'
import path from 'path'

// ========================================
// FIXTURE MODE - Toggle for development
// ========================================
// Set to true to use cached Munich fixture (fast, no API calls)
// Set to false to use live Overpass API (slower, production mode)
const USE_FIXTURE = true
const FIXTURE_PATH = path.join(process.cwd(), 'fixtures/munich-streets.geojson')
// ========================================

// --- SVG Handling ---

/**
 * Convert SVG points (x, y) to geographic coordinates (lat, lng)
 * Centers the shape at the given location and scales to the radius
 */
const convertSvgPointsToLatLng = (points, center, radiusMeters) => {
    if (points.length === 0) return []

    // First normalize the points to be centered at origin with unit scale
    const normalized = normalizeSvgPoints(points)

    // Convert normalized coordinates to lat/lng
    // Scale factor: radiusMeters determines how large the shape will be
    const metersPerDegreeLat = 111320
    const metersPerDegreeLng = 40075000 * Math.cos((center.lat * Math.PI) / 180) / 360

    return normalized.map((p) => {
        // Note: SVG y-axis is typically inverted (positive down)
        // We negate y to flip the shape right-side up
        const latOffset = (-p.y * radiusMeters) / metersPerDegreeLat
        const lngOffset = (p.x * radiusMeters) / metersPerDegreeLng
        return {
            lat: center.lat + latOffset,
            lng: center.lng + lngOffset
        }
    })
}

/**
 * Process SVG string into lat/lng points using the new comprehensive parser
 */
const convertSvgToLatLngPoints = (svgString, center, radius, numPoints = 80) => {
    console.log('[SVG] Processing SVG with new parser...')

    // Use the new comprehensive SVG parser
    const svgPoints = svgToPoints(svgString, {
        numPoints: numPoints,
        curveSamples: 20,
        closePath: true
    })

    if (svgPoints.length === 0) {
        console.warn('[SVG] No points extracted from SVG')
        return []
    }

    console.log(`[SVG] Extracted ${svgPoints.length} points, converting to lat/lng...`)

    // Convert to lat/lng coordinates
    return convertSvgPointsToLatLng(svgPoints, center, radius)
}

// --- Overpass + Fitting ---
async function fetchStreetNodes(location, radius) {
    // FIXTURE MODE: Load from cached file
    if (USE_FIXTURE) {
        console.log('🔧 [FIXTURE MODE] Loading cached street data from:', FIXTURE_PATH)
        return loadStreetNodesFromFixture(location, radius)
    }

    // LIVE MODE: Fetch from Overpass API
    console.log('🌍 [LIVE MODE] Fetching from Overpass API...')
    const query = `
    [out:json][timeout:25];
    (
      way["highway"~"primary|secondary|tertiary|residential|cycleway"](around:${radius},${location.lat},${location.lng});
    );
    out geom;
  `

    const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query,
    })

    if (!res.ok) throw new Error('Overpass API fetch failed')

    const data = await res.json()
    const coords = []

    for (const way of data.elements) {
        if (way.type === 'way' && way.geometry) {
            for (const node of way.geometry) {
                coords.push([node.lon, node.lat])
            }
        }
    }

    if (coords.length === 0) throw new Error('No street nodes found')
    return coords
}

// Load street nodes from cached GeoJSON fixture
function loadStreetNodesFromFixture(location, radius) {
    try {
        const geojsonData = fs.readFileSync(FIXTURE_PATH, 'utf8')
        const geojson = JSON.parse(geojsonData)

        const coords = []

        // Extract coordinates from GeoJSON LineStrings
        for (const feature of geojson.features) {
            if (feature.geometry.type === 'LineString') {
                for (const coord of feature.geometry.coordinates) {
                    coords.push([coord[0], coord[1]]) // [lon, lat]
                }
            }
        }

        console.log(`✅ Loaded ${coords.length} street nodes from fixture`)

        if (coords.length === 0) {
            throw new Error('No street nodes found in fixture')
        }

        return coords
    } catch (error) {
        console.error('❌ Failed to load fixture:', error.message)
        throw new Error(`Fixture loading failed: ${error.message}`)
    }
}

function snapPointsToNodes(points, rawNodes) {
    const items = rawNodes.map(([lon, lat]) => ({
        minX: lon,
        minY: lat,
        maxX: lon,
        maxY: lat,
        lon,
        lat,
    }))

    const index = new RBush()
    index.load(items)

    return points.map(([lon, lat]) => {
        const [nearest] = knn(index, lon, lat, 1)
        return [nearest.lon, nearest.lat]
    })
}

function calculateRouteDistance(coordinates) {
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
    
    return Math.round(totalDistance * 100) / 100 // Round to 2 decimal places
}

// --- Shape Optimization ---

// Build spatial index once for fast nearest-neighbor queries
let cachedSpatialIndex = null
let cachedNodesHash = null

function buildSpatialIndex(rawNodes) {
    // Create a simple hash to detect if nodes changed
    const nodesHash = rawNodes.length

    if (cachedSpatialIndex && cachedNodesHash === nodesHash) {
        return cachedSpatialIndex
    }

    console.log('[Optimization] Building spatial index for', rawNodes.length, 'nodes...')
    const startTime = Date.now()

    const items = rawNodes.map(([lon, lat]) => ({
        minX: lon,
        minY: lat,
        maxX: lon,
        maxY: lat,
        lon,
        lat,
    }))

    const index = new RBush()
    index.load(items)

    cachedSpatialIndex = index
    cachedNodesHash = nodesHash

    console.log(`[Optimization] Spatial index built in ${Date.now() - startTime}ms`)
    return index
}

function transformShape(shape, [scale, theta, tx, ty]) {
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    return shape.map(([x, y]) => [
        scale * (x * cos - y * sin) + tx,
        scale * (x * sin + y * cos) + ty,
    ])
}

function costFunctionWithIndex(params, shape, spatialIndex, targetDistanceKm = null, rawNodes = null) {
    const transformed = transformShape(shape, params)

    // Cost 1: Distance to nearest street nodes using spatial index (O(log n) per point)
    let shapeFitCost = 0
    for (const [x, y] of transformed) {
        // Use KNN to find nearest node - much faster than brute force
        const [nearest] = knn(spatialIndex, x, y, 1)
        if (nearest) {
            const dx = x - nearest.lon
            const dy = y - nearest.lat
            shapeFitCost += dx * dx + dy * dy
        } else {
            shapeFitCost += 1 // Penalty if no node found
        }
    }

    // Cost 2: Distance from target distance (if specified)
    // Note: Only check distance occasionally to save computation
    let distanceCost = 0
    if (targetDistanceKm && rawNodes) {
        const snapped = snapPointsToNodes(transformed, rawNodes)
        const actualDistance = calculateRouteDistance(snapped)
        const distanceError = Math.abs(actualDistance - targetDistanceKm) / targetDistanceKm
        distanceCost = distanceError * 1000
    }

    return shapeFitCost + distanceCost
}

// Legacy cost function for backward compatibility (not used for SVG)
function costFunction(params, shape, coords, targetDistanceKm = null) {
    const transformed = transformShape(shape, params)

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

    let distanceCost = 0
    if (targetDistanceKm) {
        const snapped = snapPointsToNodes(transformed, coords)
        const actualDistance = calculateRouteDistance(snapped)
        const distanceError = Math.abs(actualDistance - targetDistanceKm) / targetDistanceKm
        distanceCost = distanceError * 1000
    }

    return shapeFitCost + distanceCost
}

function nelderMead(f, x0, maxIterations = 100) {
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
            simplex[i] = simplex[0].map(
                (v, j) => v + sigma * (simplex[i][j] - v)
            )
    }

    return { x: simplex[0], fx: f(simplex[0]) }
}

async function fitShapeToStreets(shapeName, location, rawNodes, targetDistanceKm = 5.0) {
    const shapeDefinition = getShape(shapeName)
    if (!shapeDefinition) {
        throw new Error(`Unsupported shape: ${shapeName}`)
    }

    const shapePoints = generateShapePoints(shapeName)
    const shape = normalizeShape(shapePoints)
    const degreesPerMeter = 1 / 111000
    
    // Use shape-specific perimeter ratio for better scaling estimation
    const perimeterRatio = shapeDefinition.estimatedPerimeterRatio || 6.0
    const estimatedScale = (targetDistanceKm * 1000 / perimeterRatio) * degreesPerMeter
    const initialParams = [estimatedScale, 0, location.lng, location.lat]

    let result = nelderMead(
        (params) => costFunction(params, shape, rawNodes, targetDistanceKm),
        initialParams,
        200 // Increase iterations for better distance targeting
    )

    // Iterative refinement to get closer to target distance (within 20%)
    let attempts = 0
    const maxAttempts = 3
    
    while (attempts < maxAttempts) {
        const transformed = transformShape(shape, result.x)
        const snapped = snapPointsToNodes(transformed, rawNodes)
        const actualDistance = calculateRouteDistance(snapped)
        const distanceError = Math.abs(actualDistance - targetDistanceKm) / targetDistanceKm
        
        // If within 20% tolerance, we're done
        if (distanceError <= 0.2) break
        
        // Adjust scale based on distance ratio
        const scaleAdjustment = targetDistanceKm / actualDistance
        const adjustedParams = [...result.x]
        adjustedParams[0] *= scaleAdjustment // Adjust scale parameter
        
        // Run optimization again with adjusted starting point
        result = nelderMead(
            (params) => costFunction(params, shape, rawNodes, targetDistanceKm),
            adjustedParams,
            150
        )
        
        attempts++
    }

    const transformed = transformShape(shape, result.x)
    const snapped = snapPointsToNodes(transformed, rawNodes)
    const totalDistance = calculateRouteDistance(snapped)

    return {
        type: 'FeatureCollection',
        properties: {
            totalDistanceKm: totalDistance,
            pointCount: snapped.length,
            targetDistanceKm: targetDistanceKm
        },
        features: snapped.map(([lon, lat]) => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [lon, lat],
            },
            properties: {},
        })),
    }
}

async function fitSvgToStreets(svgPoints, location, rawNodes, targetDistanceKm = 5.0) {
    console.log('[fitSvgToStreets] Starting optimization...')
    const startTime = Date.now()

    // Build spatial index for fast nearest-neighbor queries
    const spatialIndex = buildSpatialIndex(rawNodes)

    // Convert SVG points to [x, y] tuples and normalize
    const normalizedSvg = normalizeShape(svgPoints.map(p => [p.lng, p.lat]))
    const degreesPerMeter = 1 / 111000

    // Estimate perimeter ratio for SVG (similar to other shapes)
    const estimatedPerimeterRatio = 6.0
    const estimatedScale = (targetDistanceKm * 1000 / estimatedPerimeterRatio) * degreesPerMeter
    const initialParams = [estimatedScale, 0, location.lng, location.lat]

    // First pass: optimize shape fit only (no distance calculation - much faster)
    console.log('[fitSvgToStreets] Phase 1: Shape fitting optimization...')
    let result = nelderMead(
        (params) => costFunctionWithIndex(params, normalizedSvg, spatialIndex, null, null),
        initialParams,
        100  // Reduced iterations since we're not checking distance
    )

    // Second pass: refine with distance targeting
    console.log('[fitSvgToStreets] Phase 2: Distance refinement...')
    let attempts = 0
    const maxAttempts = 2  // Reduced from 3

    while (attempts < maxAttempts) {
        const transformed = transformShape(normalizedSvg, result.x)
        const snapped = snapPointsToNodes(transformed, rawNodes)
        const actualDistance = calculateRouteDistance(snapped)
        const distanceError = Math.abs(actualDistance - targetDistanceKm) / targetDistanceKm

        console.log(`[fitSvgToStreets] Attempt ${attempts + 1}: distance=${actualDistance.toFixed(2)}km, error=${(distanceError * 100).toFixed(1)}%`)
        
        // If within 20% tolerance, we're done
        if (distanceError <= 0.2) break
        
        // Adjust scale based on distance ratio
        const scaleAdjustment = targetDistanceKm / actualDistance
        const adjustedParams = [...result.x]
        adjustedParams[0] *= scaleAdjustment

        // Run optimization again with adjusted starting point (using indexed cost function)
        result = nelderMead(
            (params) => costFunctionWithIndex(params, normalizedSvg, spatialIndex, null, null),
            adjustedParams,
            50  // Fewer iterations for refinement
        )

        attempts++
    }

    const transformed = transformShape(normalizedSvg, result.x)
    const snapped = snapPointsToNodes(transformed, rawNodes)
    const totalDistance = calculateRouteDistance(snapped)

    console.log(`[fitSvgToStreets] Completed in ${Date.now() - startTime}ms, final distance: ${totalDistance.toFixed(2)}km`)

    return {
        type: 'FeatureCollection',
        properties: {
            totalDistanceKm: totalDistance,
            pointCount: snapped.length,
            targetDistanceKm: targetDistanceKm
        },
        features: snapped.map(([lon, lat]) => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [lon, lat],
            },
            properties: {},
        })),
    }
}

// --- API Endpoint ---
export async function POST(req) {
    try {
        const { location, shape, targetDistanceKm = 5.0, svg } = await req.json()
        
        // Calculate appropriate fetch radius based on target distance
        // Use 2x target distance to ensure enough streets are available
        const radius = Math.max(500, Math.min(5000, targetDistanceKm * 2000))

        if (
            !location ||
            typeof location.lat !== 'number' ||
            typeof location.lng !== 'number'
        ) {
            throw new Error('Invalid location')
        }

        const nodes = await fetchStreetNodes(location, radius)

        if (svg && shape?.toLowerCase() === 'custom') {
            console.log('[API] Processing custom SVG shape...')

            // Use improved SVG parser with proper curve handling and RDP simplification
            // The new parser handles: all SVG commands, bezier curves, arcs, and auto-simplification
            const svgRadius = targetDistanceKm * 1000 / 6 // Initial scale estimate

            // Parse SVG with 80 evenly-spaced points (RDP + resampling built-in)
            const coords = convertSvgToLatLngPoints(svg, location, svgRadius, 80)

            if (coords.length === 0) {
                throw new Error('Could not extract points from SVG. Ensure SVG contains valid path elements.')
            }

            console.log(`[API] SVG parsed: ${coords.length} points ready for optimization`)

            // Use optimization-based fitting for SVG
            const result = await fitSvgToStreets(coords, location, nodes, targetDistanceKm)
            return NextResponse.json(result)
        }

        const result = await fitShapeToStreets(shape.trim(), location, nodes, targetDistanceKm)
        return NextResponse.json(result)
    } catch (err) {
        console.error('[BACKEND ERROR]', err)
        return NextResponse.json(
            {
                error: err.message || 'Internal Server Error',
                stack: err.stack || null,
            },
            { status: 500 }
        )
    }
}