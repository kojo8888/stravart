import { NextResponse } from 'next/server'
import type { Feature, FeatureCollection, Point } from 'geojson'
import KDBush from 'kdbush'
import { around } from 'geokdbush'

// Define our 2D point format: [lon, lat]
type Point2D = [number, number]

interface Coordinates {
    lat: number
    lng: number
}

interface Payload {
    location: Coordinates | null
    shape: string
    radius?: number
}

interface FminResult {
    x: number[]
    fx: number
}

// ---------- Nelder-Mead Optimizer ----------
function nelderMead(
    f: (x: number[]) => number,
    x0: number[],
    maxIterations = 200
): FminResult {
    const alpha = 1
    const gamma = 2
    const rho = 0.5
    const sigma = 0.5

    const n = x0.length
    let simplex = [x0]
    for (let i = 0; i < n; i++) {
        const x = x0.slice()
        x[i] += 0.05
        simplex.push(x)
    }

    for (let iter = 0; iter < maxIterations; iter++) {
        simplex.sort((a, b) => f(a) - f(b))
        const best = simplex[0]
        const worst = simplex[n]

        const centroid = Array(n).fill(0)
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n
        }

        const reflected = centroid.map((c, i) => c + alpha * (c - worst[i]))
        if (f(reflected) < f(simplex[n - 1])) {
            simplex[n] = reflected
            continue
        }

        const expanded = centroid.map((c, i) => c + gamma * (reflected[i] - c))
        if (f(expanded) < f(reflected)) {
            simplex[n] = expanded
            continue
        }

        const contracted = centroid.map((c, i) => c + rho * (worst[i] - c))
        if (f(contracted) < f(worst)) {
            simplex[n] = contracted
            continue
        }

        for (let i = 1; i <= n; i++) {
            simplex[i] = simplex[0].map(
                (b, j) => b + sigma * (simplex[i][j] - b)
            )
        }
    }

    const best = simplex[0]
    return { x: best, fx: f(best) }
}

// ---------- SHAPE GENERATOR ----------
function generateHeart(numPoints: number = 200): number[][] {
    const result: number[][] = []
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

// ---------- TRANSFORM & COST ----------
function transformShape(shape: number[][], params: number[]): number[][] {
    const [scale, theta, tx, ty] = params
    const cosTheta = Math.cos(theta)
    const sinTheta = Math.sin(theta)
    return shape.map(([x, y]) => [
        scale * (x * cosTheta - y * sinTheta) + tx,
        scale * (x * sinTheta + y * cosTheta) + ty,
    ])
}

function costFunction(
    params: number[],
    shape: number[][],
    coords: Point2D[]
): number {
    const transformed = transformShape(shape, params)
    let total = 0
    for (const point of transformed) {
        let minDist = Infinity
        for (const node of coords) {
            const dx = point[0] - node[0]
            const dy = point[1] - node[1]
            const dist = dx * dx + dy * dy
            if (dist < minDist) minDist = dist
        }
        total += minDist
    }
    return total
}

// ---------- KDTree snapping ----------
function snapPointsToNearestNodes(
    transformedPoints: number[][],
    nodes: Point2D[]
): Point2D[] {
    const index = new KDBush(
        nodes as any[],
        (p) => p[0],
        (p) => p[1]
    )

    return transformedPoints.map(([lon, lat]) => {
        const [nearest] = around(index, lon, lat, 1) as Point2D[]
        return [nearest[0], nearest[1]]
    })
}

// ---------- FETCH STREET NODES ----------
async function fetchStreetNodes(
    location: Coordinates,
    radius: number
): Promise<Point2D[]> {
    const overpassQuery = `
    [out:json][timeout:25];
    (
      way["highway"](around:${radius},${location.lat},${location.lng});
    );
    out geom;
  `
    const overpassUrl = 'https://overpass-api.de/api/interpreter'

    console.log('[BACKEND] Fetching street nodes from Overpass API...')

    const response = await fetch(overpassUrl, {
        method: 'POST',
        body: overpassQuery,
    })

    if (!response.ok) {
        console.error(
            '[BACKEND] Overpass API fetch failed:',
            response.statusText
        )
        throw new Error('Failed to fetch street data from Overpass API.')
    }

    const data = await response.json()

    const coords: Point2D[] = []
    for (const way of data.elements) {
        if (way.type === 'way' && way.geometry) {
            for (const node of way.geometry) {
                coords.push([node.lon, node.lat])
            }
        }
    }

    console.log(
        `[BACKEND] Fetched ${coords.length} street nodes from Overpass.`
    )

    if (coords.length === 0) {
        throw new Error('No street nodes found in the selected area.')
    }

    return coords
}

// ---------- MAIN OPTIMIZATION ----------
async function runOptimization(
    shapeType: string,
    location: Coordinates,
    coords: Point2D[]
): Promise<FeatureCollection> {
    if (shapeType.toLowerCase() !== 'heart') {
        throw new Error(`Shape type "${shapeType}" not supported.`)
    }

    const shape = generateHeart(200)
    const centerX = location.lng
    const centerY = location.lat
    const initialParams = [0.03, 0, centerX, centerY]

    const result = nelderMead(
        (params: number[]) => costFunction(params, shape, coords),
        initialParams
    )

    const transformed = transformShape(shape, result.x)
    const snapped = snapPointsToNearestNodes(transformed, coords)

    const features: Feature<Point>[] = snapped.map(([lon, lat]) => ({
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [lon, lat],
        },
        properties: {},
    }))

    return {
        type: 'FeatureCollection',
        features,
    }
}

// ---------- API HANDLER ----------
export async function POST(request: Request) {
    try {
        const payload: Payload = await request.json()
        console.log('[BACKEND] Payload received:', payload)

        const location = payload.location
        const shape = (payload.shape || '').trim()
        const radius =
            typeof payload.radius === 'number' ? payload.radius : 1500

        if (!location) {
            return NextResponse.json(
                { error: 'Location is required.' },
                { status: 400 }
            )
        }

        const nodes = await fetchStreetNodes(location, radius)

        if (!shape) {
            const features: Feature<Point>[] = nodes.map(([lon, lat]) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [lon, lat],
                },
                properties: {},
            }))

            return NextResponse.json({
                type: 'FeatureCollection',
                features,
            })
        }

        const result = await runOptimization(shape, location, nodes)
        return NextResponse.json(result)
    } catch (err: unknown) {
        const errorMessage =
            err instanceof Error ? err.message : 'Unknown error'
        console.error('[BACKEND] Unexpected error:', err)
        return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
}
