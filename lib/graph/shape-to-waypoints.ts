/**
 * Convert shapes to waypoints for routing
 */

import type { Waypoint, Coordinate } from './types'

/**
 * Generate waypoints from an array of coordinates
 *
 * @param coordinates - Shape coordinates (already scaled and positioned)
 * @param waypointCount - Number of waypoints to generate (default: auto-calculate)
 * @returns Array of waypoints evenly distributed along the shape
 */
export function generateWaypoints(
    coordinates: Coordinate[],
    waypointCount?: number
): Waypoint[] {
    if (coordinates.length === 0) {
        return []
    }

    // If waypoint count not specified, use one waypoint per ~200m of perimeter
    const perimeter = calculatePerimeter(coordinates)
    const defaultCount = Math.max(8, Math.min(50, Math.ceil(perimeter / 200)))
    const targetCount = waypointCount || defaultCount

    // If we have fewer coordinates than target waypoints, use all coordinates
    if (coordinates.length <= targetCount) {
        return coordinates.map((coord, index) => ({
            lat: coord.lat,
            lng: coord.lng,
            order: index,
        }))
    }

    // Sample waypoints evenly along the shape
    const waypoints: Waypoint[] = []
    const step = coordinates.length / targetCount

    for (let i = 0; i < targetCount; i++) {
        const index = Math.floor(i * step)
        waypoints.push({
            lat: coordinates[index].lat,
            lng: coordinates[index].lng,
            order: i,
        })
    }

    return waypoints
}

/**
 * Calculate perimeter of a shape in meters
 */
function calculatePerimeter(coordinates: Coordinate[]): number {
    if (coordinates.length < 2) {
        return 0
    }

    let perimeter = 0
    for (let i = 0; i < coordinates.length - 1; i++) {
        perimeter += haversineDistance(coordinates[i], coordinates[i + 1])
    }

    // Add distance from last point back to first (if closed shape)
    if (coordinates.length > 2) {
        perimeter += haversineDistance(
            coordinates[coordinates.length - 1],
            coordinates[0]
        )
    }

    return perimeter
}

/**
 * Haversine distance formula (copied from utils to avoid circular import)
 */
function haversineDistance(coord1: Coordinate, coord2: Coordinate): number {
    const R = 6371000 // Earth's radius in meters
    const lat1 = toRadians(coord1.lat)
    const lat2 = toRadians(coord2.lat)
    const deltaLat = toRadians(coord2.lat - coord1.lat)
    const deltaLng = toRadians(coord2.lng - coord1.lng)

    const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
}

function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180)
}

/**
 * Generate waypoints for a mathematical shape
 *
 * @param shapeType - Type of shape (heart, circle, star, square)
 * @param center - Center coordinate
 * @param radiusMeters - Radius in meters
 * @param pointCount - Number of points to generate for the shape
 * @param waypointCount - Number of waypoints (default: auto)
 * @returns Array of waypoints
 */
export function generateWaypointsForShape(
    shapeType: 'heart' | 'circle' | 'star' | 'square',
    center: Coordinate,
    radiusMeters: number,
    pointCount: number = 100,
    waypointCount?: number
): Waypoint[] {
    const points = generateShapePoints(shapeType, center, radiusMeters, pointCount)
    return generateWaypoints(points, waypointCount)
}

/**
 * Generate shape coordinates
 * Uses mathematical formulas to create shapes
 */
function generateShapePoints(
    shapeType: string,
    center: Coordinate,
    radiusMeters: number,
    pointCount: number
): Coordinate[] {
    const points: Coordinate[] = []
    const metersPerDegree = 111320 // Approximate at equator

    // Convert radius to degrees
    const radiusDegrees = radiusMeters / metersPerDegree

    switch (shapeType) {
        case 'circle':
            for (let i = 0; i < pointCount; i++) {
                const angle = (i / pointCount) * 2 * Math.PI
                points.push({
                    lat: center.lat + radiusDegrees * Math.sin(angle),
                    lng: center.lng + radiusDegrees * Math.cos(angle) / Math.cos(center.lat * Math.PI / 180),
                })
            }
            break

        case 'heart':
            for (let i = 0; i < pointCount; i++) {
                const t = (i / pointCount) * 2 * Math.PI
                // Heart shape parametric equations
                const x = 16 * Math.pow(Math.sin(t), 3)
                const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)

                // Scale and position
                const scale = radiusDegrees / 20 // Normalize heart size
                points.push({
                    lat: center.lat + y * scale,
                    lng: center.lng + x * scale / Math.cos(center.lat * Math.PI / 180),
                })
            }
            break

        case 'star':
            const spikes = 5
            const outerRadius = radiusDegrees
            const innerRadius = radiusDegrees * 0.4

            for (let i = 0; i < pointCount; i++) {
                const angle = (i / pointCount) * 2 * Math.PI
                const spike = Math.floor(angle / (2 * Math.PI / spikes))
                const spikeAngle = angle - (spike * 2 * Math.PI / spikes)
                const radius = spikeAngle < Math.PI / spikes ? outerRadius : innerRadius

                points.push({
                    lat: center.lat + radius * Math.sin(angle),
                    lng: center.lng + radius * Math.cos(angle) / Math.cos(center.lat * Math.PI / 180),
                })
            }
            break

        case 'square':
            const pointsPerSide = Math.floor(pointCount / 4)
            const halfSize = radiusDegrees

            // Top side
            for (let i = 0; i < pointsPerSide; i++) {
                const t = i / pointsPerSide
                points.push({
                    lat: center.lat + halfSize,
                    lng: center.lng + (t * 2 - 1) * halfSize / Math.cos(center.lat * Math.PI / 180),
                })
            }

            // Right side
            for (let i = 0; i < pointsPerSide; i++) {
                const t = i / pointsPerSide
                points.push({
                    lat: center.lat + halfSize - t * 2 * halfSize,
                    lng: center.lng + halfSize / Math.cos(center.lat * Math.PI / 180),
                })
            }

            // Bottom side
            for (let i = 0; i < pointsPerSide; i++) {
                const t = i / pointsPerSide
                points.push({
                    lat: center.lat - halfSize,
                    lng: center.lng + halfSize / Math.cos(center.lat * Math.PI / 180) - t * 2 * halfSize / Math.cos(center.lat * Math.PI / 180),
                })
            }

            // Left side
            for (let i = 0; i < pointsPerSide; i++) {
                const t = i / pointsPerSide
                points.push({
                    lat: center.lat - halfSize + t * 2 * halfSize,
                    lng: center.lng - halfSize / Math.cos(center.lat * Math.PI / 180),
                })
            }
            break

        default:
            // Default to circle
            for (let i = 0; i < pointCount; i++) {
                const angle = (i / pointCount) * 2 * Math.PI
                points.push({
                    lat: center.lat + radiusDegrees * Math.sin(angle),
                    lng: center.lng + radiusDegrees * Math.cos(angle) / Math.cos(center.lat * Math.PI / 180),
                })
            }
    }

    return points
}

/**
 * Simplify waypoints by removing points that are too close together
 *
 * @param waypoints - Original waypoints
 * @param minDistanceMeters - Minimum distance between waypoints
 * @returns Simplified waypoints
 */
export function simplifyWaypoints(
    waypoints: Waypoint[],
    minDistanceMeters: number = 100
): Waypoint[] {
    if (waypoints.length <= 2) {
        return waypoints
    }

    const simplified: Waypoint[] = [waypoints[0]]
    let lastIncluded = waypoints[0]

    for (let i = 1; i < waypoints.length; i++) {
        const current = waypoints[i]
        const distance = haversineDistance(
            { lat: lastIncluded.lat, lng: lastIncluded.lng },
            { lat: current.lat, lng: current.lng }
        )

        if (distance >= minDistanceMeters) {
            simplified.push({ ...current, order: simplified.length })
            lastIncluded = current
        }
    }

    return simplified
}

/**
 * Get waypoint statistics
 */
export function getWaypointStats(waypoints: Waypoint[]) {
    if (waypoints.length < 2) {
        return {
            count: waypoints.length,
            perimeter: 0,
            avgDistance: 0,
        }
    }

    const perimeter = calculatePerimeter(
        waypoints.map((w) => ({ lat: w.lat, lng: w.lng }))
    )

    return {
        count: waypoints.length,
        perimeter: Math.round(perimeter),
        avgDistance: Math.round(perimeter / waypoints.length),
    }
}
