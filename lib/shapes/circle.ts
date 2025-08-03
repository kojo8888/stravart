import { Point, ShapeDefinition } from './types'

const generateCircle = (numPoints = 60): Point[] => {
    const result: Point[] = []
    for (let i = 0; i < numPoints; i++) {
        const t = (2 * Math.PI * i) / numPoints
        const radius = 20
        const x = radius * Math.cos(t)
        const y = radius * Math.sin(t)
        result.push({ x, y })
    }
    return result
}

export const circleShape: ShapeDefinition = {
    name: 'circle',
    displayName: '⭕ Circle',
    description: 'Perfect circle for a balanced route',
    generate: generateCircle,
    estimatedPerimeterRatio: 6.28 // 2π
}