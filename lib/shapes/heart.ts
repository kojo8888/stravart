import { Point, ShapeDefinition } from './types'

const generateHeart = (numPoints = 80): Point[] => {
    const result: Point[] = []
    for (let i = 0; i < numPoints; i++) {
        const t = (2 * Math.PI * i) / numPoints
        const x = 16 * Math.pow(Math.sin(t), 3)
        const y =
            13 * Math.cos(t) -
            5 * Math.cos(2 * t) -
            2 * Math.cos(3 * t) -
            Math.cos(4 * t)
        result.push({ x, y })
    }
    return result
}

export const heartShape: ShapeDefinition = {
    name: 'heart',
    displayName: '❤️ Heart',
    description: 'Classic heart shape perfect for romantic routes',
    generate: generateHeart,
    estimatedPerimeterRatio: 5.5 // Heart perimeter is roughly 5.5 times its width
}