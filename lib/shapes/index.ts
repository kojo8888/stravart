import { ShapeDefinition, Point, ShapePoint } from './types'
import { heartShape } from './heart'
import { circleShape } from './circle'
import { starShape } from './star'
import { squareShape } from './square'

// Registry of all available shapes
export const shapes: Record<string, ShapeDefinition> = {
    heart: heartShape,
    circle: circleShape, 
    star: starShape,
    square: squareShape,
}

// Get all available shapes as array
export const getAvailableShapes = (): ShapeDefinition[] => {
    return Object.values(shapes)
}

// Get a specific shape by name
export const getShape = (name: string): ShapeDefinition | null => {
    return shapes[name] || null
}

// Generate shape points in [x, y] format for compatibility with existing code
export const generateShapePoints = (shapeName: string, numPoints?: number): ShapePoint[] => {
    const shape = getShape(shapeName)
    if (!shape) {
        throw new Error(`Unknown shape: ${shapeName}`)
    }
    
    const points = shape.generate(numPoints)
    return points.map(p => [p.x, p.y])
}

// Normalize shape points (center and scale to unit size)
export const normalizeShape = (shapePoints: ShapePoint[]): ShapePoint[] => {
    if (shapePoints.length === 0) return []
    
    const xs = shapePoints.map(([x]) => x)
    const ys = shapePoints.map(([, y]) => y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const scale = 1 / Math.max(maxX - minX, maxY - minY)
    
    return shapePoints.map(([x, y]) => [
        (x - centerX) * scale,
        (y - centerY) * scale
    ])
}

// Export types
export type { ShapeDefinition, Point, ShapePoint }