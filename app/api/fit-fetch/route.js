import { NextResponse } from 'next/server'
import RBush from 'rbush'
import knn from 'rbush-knn'
import distance from '@turf/distance'
import { generateShapePoints, normalizeShape, getShape } from '@/lib/shapes'

// --- SVG Handling ---
const parseSvgPathsAndPolylines = (svgString) => {
    const pathRegex = /<path[^>]*d="([^"]+)"[^>]*>/g
    const polylineRegex = /<polyline[^>]*points="([^"]+)"[^>]*>/g

    const allPoints = []

    let match
    while ((match = pathRegex.exec(svgString)) !== null) {
        const d = match[1]
        const points = parseSvgPath(d)
        allPoints.push(...points)
    }

    while ((match = polylineRegex.exec(svgString)) !== null) {
        const pointsStr = match[1].trim()
        const points = pointsStr.split(/\s+/).map((pair) => {
            const [x, y] = pair.split(',').map(Number)
            return { x, y }
        })
        allPoints.push(...points)
    }

    return allPoints
}

const parseSvgPath = (svgPath) => {
    const regex = /[ML]\s*(-?\d+\.?\d*)\s*(-?\d+\.?\d*)/g
    let match
    const points = []

    while ((match = regex.exec(svgPath)) !== null) {
        const x = parseFloat(match[1])
        const y = parseFloat(match[2])
        points.push({ x, y })
    }

    return points
}

const normalizePoints = (points, center, radiusMeters) => {
    const maxX = Math.max(...points.map((p) => p.x))
    const maxY = Math.max(...points.map((p) => p.y))
    const scale = radiusMeters / Math.max(maxX, maxY)

    return points.map((p) => {
        const latOffset = (p.y * scale) / 111320
        const lngOffset =
            (p.x * scale) /
            ((40075000 * Math.cos((center.lat * Math.PI) / 180)) / 360)
        return { lat: center.lat + latOffset, lng: center.lng + lngOffset }
    })
}

const simplifyRDP = (points, epsilon = 0.0002) => {
    if (points.length < 3) return points

    const getSqDist = (p1, p2) =>
        (p1.lat - p2.lat) ** 2 + (p1.lng - p2.lng) ** 2

    const getSqSegDist = (p, p1, p2) => {
        let x = p1.lng,
            y = p1.lat
        let dx = p2.lng - x,
            dy = p2.lat - y

        if (dx !== 0 || dy !== 0) {
            const t =
                ((p.lng - x) * dx + (p.lat - y) * dy) / (dx * dx + dy * dy)
            if (t > 1) {
                x = p2.lng
                y = p2.lat
            } else if (t > 0) {
                x += dx * t
                y += dy * t
            }
        }

        dx = p.lng - x
        dy = p.lat - y
        return dx * dx + dy * dy
    }

    const simplifyStep = (pts, first, last, eps, simplified) => {
        let maxDist = 0
        let index = first

        for (let i = first + 1; i < last; i++) {
            const dist = getSqSegDist(pts[i], pts[first], pts[last])
            if (dist > maxDist) {
                index = i
                maxDist = dist
            }
        }

        if (maxDist > eps * eps) {
            if (index - first > 1)
                simplifyStep(pts, first, index, eps, simplified)
            simplified.push(pts[index])
            if (last - index > 1)
                simplifyStep(pts, index, last, eps, simplified)
        }
    }

    const simplified = [points[0]]
    simplifyStep(points, 0, points.length - 1, epsilon, simplified)
    simplified.push(points[points.length - 1])
    return simplified
}

const convertSvgToLatLngPoints = (svgString, center, radius) => {
    const allPoints = parseSvgPathsAndPolylines(svgString)
    if (allPoints.length === 0) return []
    return normalizePoints(allPoints, center, radius)
}

// --- Overpass + Fitting ---
async function fetchStreetNodes(location, radius) {
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

function transformShape(shape, [scale, theta, tx, ty]) {
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    return shape.map(([x, y]) => [
        scale * (x * cos - y * sin) + tx,
        scale * (x * sin + y * cos) + ty,
    ])
}

function costFunction(params, shape, coords, targetDistanceKm = null) {
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
        const snapped = snapPointsToNodes(transformed, coords)
        const actualDistance = calculateRouteDistance(snapped)
        const distanceError = Math.abs(actualDistance - targetDistanceKm) / targetDistanceKm
        distanceCost = distanceError * 1000 // Weight distance accuracy heavily
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
            // For SVG, scale based on target distance
            const svgRadius = targetDistanceKm * 1000 / 4 // Rough estimation for SVG scaling
            const coords = convertSvgToLatLngPoints(svg, location, svgRadius)
            const simplified = simplifyRDP(coords, 0.0002)
            const snapped = snapPointsToNodes(
                simplified.map((p) => [p.lng, p.lat]),
                nodes
            )
            const totalDistance = calculateRouteDistance(snapped)

            return NextResponse.json({
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
            })
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
