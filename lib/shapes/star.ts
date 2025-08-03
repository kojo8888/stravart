import { Point, ShapeDefinition } from './types'

const generateStar = (numPoints = 100): Point[] => {
    const result: Point[] = []
    const spikes = 5
    const outerRadius = 20
    const innerRadius = 8
    
    for (let i = 0; i < numPoints; i++) {
        const angle = (2 * Math.PI * i) / numPoints
        const spikeProgress = (angle * spikes) % (2 * Math.PI)
        const isOuter = spikeProgress < Math.PI
        const radius = isOuter ? outerRadius : innerRadius
        
        const x = radius * Math.cos(angle)
        const y = radius * Math.sin(angle)
        result.push({ x, y })
    }
    return result
}

export const starShape: ShapeDefinition = {
    name: 'star',
    displayName: '⭐ Star',
    description: '5-pointed star shape',
    generate: generateStar,
    estimatedPerimeterRatio: 7.2
}