import { Point, ShapeDefinition } from './types'

const generateSquare = (numPoints = 80): Point[] => {
    const result: Point[] = []
    const size = 20
    const pointsPerSide = Math.floor(numPoints / 4)
    
    // Top side (left to right)
    for (let i = 0; i < pointsPerSide; i++) {
        const x = -size + (2 * size * i) / (pointsPerSide - 1)
        result.push({ x, y: size })
    }
    
    // Right side (top to bottom)
    for (let i = 0; i < pointsPerSide; i++) {
        const y = size - (2 * size * i) / (pointsPerSide - 1)
        result.push({ x: size, y })
    }
    
    // Bottom side (right to left)
    for (let i = 0; i < pointsPerSide; i++) {
        const x = size - (2 * size * i) / (pointsPerSide - 1)
        result.push({ x, y: -size })
    }
    
    // Left side (bottom to top)
    for (let i = 0; i < pointsPerSide; i++) {
        const y = -size + (2 * size * i) / (pointsPerSide - 1)
        result.push({ x: -size, y })
    }
    
    return result
}

export const squareShape: ShapeDefinition = {
    name: 'square',
    displayName: '🔲 Square',
    description: 'Perfect square with straight sides',
    generate: generateSquare,
    estimatedPerimeterRatio: 8.0 // 4 sides
}