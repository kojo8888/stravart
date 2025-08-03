export interface Point {
    x: number
    y: number
}

export interface ShapeDefinition {
    name: string
    displayName: string
    description: string
    generate: (numPoints?: number) => Point[]
    estimatedPerimeterRatio?: number // Ratio of perimeter to shape width for scaling
}

export type ShapePoint = [number, number] // [x, y] format for compatibility