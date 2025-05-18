import { NextResponse } from 'next/server'
import RBush from 'rbush'
import knn from 'rbush-knn'

// ---------- SVG Handling ----------
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
        const latOffset = (p.y * scale) / 111320 // approx meters per lat
        const lngOffset =
            (p.x * scale) /
            ((40075000 * Math.cos((center.lat * Math.PI) / 180)) / 360) // meters per lon
        return {
            lat: center.lat + latOffset,
            lng: center.lng + lngOffset,
        }
    })
}

const convertSvgToLatLngPoints = (svgString, center, radius) => {
    const pathMatch = svgString.match(/<path[^>]*d="([^"]+)"/)
    if (!pathMatch) return []

    const pathData = pathMatch[1]
    const rawPoints = parseSvgPath(pathData)
    return normalizePoints(rawPoints, center, radius)
}

// ---------- Heart Shape Generator ----------
function generateHeart(numPoints = 80) {
    const result = []
    for (let i = 0; i < numPoints; i++) {
        const t = (2 * Math.PI * i) / numPoints
        const x = 16 * Math.pow(Math.sin(t), 3)
        const y =
            13 * Math.cos(t) -
            5 * Math.cos(2 * t) -
            2 * Math.cos(3 * t) -
            Math.cos(4 * t)
        result.push([x, y])
    }
    return result
}

function normalizeShape(shape) {
    const xs = shape.map(([x]) => x)
    const ys = shape.map(([, y]) => y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const scale = 1 / Math.max(maxX - minX, maxY - minY)
    return shape.map(([x, y]) => [(x - centerX) * scale, (y - centerY) * scale])
}

function transformShape(shape, [scale, theta, tx, ty]) {
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    return shape.map(([x, y]) => [
        scale * (x * cos - y * sin) + tx,
        scale * (x * sin + y * cos) + ty,
    ])
}

function costFunction(params, shape, coords) {
    const transformed = transformShape(shape, params)
    let total = 0
    for (const [x, y] of transformed) {
        let min = Infinity
        for (const { lon, lat } of coords) {
            const dx = x - lon
            const dy = y - lat
            const dist = dx * dx + dy * dy
            if (dist < min) min = dist
        }
        total += min
    }
    return total
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

async function fitShapeToStreets(shapeName, location, rawNodes) {
    if (shapeName !== 'heart')
        throw new Error(`Unsupported shape: ${shapeName}`)

    const shape = normalizeShape(generateHeart())
    const degreesPerMeter = 1 / 111000
    const scale = 1000 * degreesPerMeter
    const initialParams = [scale, 0, location.lng, location.lat]
    const wrappedNodes = rawNodes.map(([lon, lat]) => ({ lon, lat }))

    const result = nelderMead(
        (params) => costFunction(params, shape, wrappedNodes),
        initialParams
    )

    const transformed = transformShape(shape, result.x)
    const snapped = snapPointsToNodes(transformed, rawNodes)

    return {
        type: 'FeatureCollection',
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

// ---------- API Route ----------
export async function POST(req) {
    try {
        const { location, shape, radius = 500, svg } = await req.json()

        if (
            !location ||
            typeof location.lat !== 'number' ||
            typeof location.lng !== 'number'
        ) {
            throw new Error('Invalid location')
        }

        const nodes = await fetchStreetNodes(location, radius)

        if (svg && shape?.toLowerCase() === 'custom') {
            const coords = convertSvgToLatLngPoints(svg, location, radius)
            const snapped = snapPointsToNodes(
                coords.map((p) => [p.lng, p.lat]),
                nodes
            )

            return NextResponse.json({
                type: 'FeatureCollection',
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

        const result = await fitShapeToStreets(shape.trim(), location, nodes)
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
