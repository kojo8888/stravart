/**
 * Utility functions for graph operations
 */

import type { Coordinate } from './types'

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param coord1 First coordinate
 * @param coord2 Second coordinate
 * @returns Distance in meters
 */
export function haversineDistance(coord1: Coordinate, coord2: Coordinate): number {
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

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180)
}

/**
 * Convert radians to degrees
 */
export function toDegrees(radians: number): number {
    return radians * (180 / Math.PI)
}

/**
 * Generate a unique node ID from coordinates
 * Rounds to ~1 meter precision
 */
export function coordToNodeId(lat: number, lng: number): string {
    // Round to 5 decimal places (~1.1 meter precision)
    const latRounded = Math.round(lat * 100000)
    const lngRounded = Math.round(lng * 100000)
    return `${latRounded},${lngRounded}`
}

/**
 * Parse node ID back to coordinates
 */
export function nodeIdToCoord(nodeId: string): Coordinate {
    const [latStr, lngStr] = nodeId.split(',')
    return {
        lat: parseInt(latStr) / 100000,
        lng: parseInt(lngStr) / 100000,
    }
}

/**
 * Check if two coordinates are within a threshold distance
 */
export function areCoordinatesNear(
    coord1: Coordinate,
    coord2: Coordinate,
    thresholdMeters: number
): boolean {
    return haversineDistance(coord1, coord2) <= thresholdMeters
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
    if (meters < 1000) {
        return `${meters.toFixed(0)}m`
    }
    return `${(meters / 1000).toFixed(2)}km`
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
    if (seconds < 60) {
        return `${seconds.toFixed(0)}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes < 60) {
        return `${minutes}m ${remainingSeconds.toFixed(0)}s`
    }
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
}

/**
 * Calculate bounding box from coordinates
 */
export function calculateBoundingBox(coordinates: Coordinate[]): {
    minLat: number
    maxLat: number
    minLng: number
    maxLng: number
} {
    if (coordinates.length === 0) {
        return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 }
    }

    let minLat = coordinates[0].lat
    let maxLat = coordinates[0].lat
    let minLng = coordinates[0].lng
    let maxLng = coordinates[0].lng

    for (const coord of coordinates) {
        minLat = Math.min(minLat, coord.lat)
        maxLat = Math.max(maxLat, coord.lat)
        minLng = Math.min(minLng, coord.lng)
        maxLng = Math.max(maxLng, coord.lng)
    }

    return { minLat, maxLat, minLng, maxLng }
}
