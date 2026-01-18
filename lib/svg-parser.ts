/**
 * SVG Path Parser and Point Converter
 *
 * Converts SVG path data to an array of points, handling:
 * - All SVG path commands (M, L, H, V, C, S, Q, T, A, Z)
 * - Relative and absolute coordinates
 * - Curve sampling (bezier, arcs)
 * - Ramer-Douglas-Peucker simplification
 * - Even point distribution resampling
 */

export interface Point {
    x: number
    y: number
}

interface ParsedCommand {
    command: string
    args: number[]
}

// =============================================================================
// SVG PATH TOKENIZER & PARSER
// =============================================================================

/**
 * Tokenize SVG path data string into commands and arguments
 */
function tokenizePath(d: string): ParsedCommand[] {
    const commands: ParsedCommand[] = []

    // Match command letters followed by their numeric arguments
    const commandRegex = /([MmLlHhVvCcSsQqTtAaZz])\s*([^MmLlHhVvCcSsQqTtAaZz]*)/g
    let match: RegExpExecArray | null

    while ((match = commandRegex.exec(d)) !== null) {
        const command = match[1]
        const argsString = match[2].trim()

        // Parse numeric arguments (handles scientific notation, negatives, decimals)
        const args: number[] = []
        if (argsString) {
            const numRegex = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g
            let numMatch: RegExpExecArray | null
            while ((numMatch = numRegex.exec(argsString)) !== null) {
                args.push(parseFloat(numMatch[0]))
            }
        }

        commands.push({ command, args })
    }

    return commands
}

/**
 * Convert all path commands to absolute coordinates
 */
function toAbsoluteCommands(commands: ParsedCommand[]): ParsedCommand[] {
    const result: ParsedCommand[] = []
    let currentX = 0
    let currentY = 0
    let startX = 0 // For Z command
    let startY = 0
    let lastControlX = 0 // For S/T smooth curves
    let lastControlY = 0
    let lastCommand = ''

    for (const { command, args } of commands) {
        const isRelative = command === command.toLowerCase()
        const cmd = command.toUpperCase()
        const absArgs: number[] = []

        switch (cmd) {
            case 'M': // Move to
                for (let i = 0; i < args.length; i += 2) {
                    const x = isRelative ? currentX + args[i] : args[i]
                    const y = isRelative ? currentY + args[i + 1] : args[i + 1]
                    absArgs.push(x, y)
                    currentX = x
                    currentY = y
                    if (i === 0) {
                        startX = x
                        startY = y
                    }
                }
                break

            case 'L': // Line to
                for (let i = 0; i < args.length; i += 2) {
                    const x = isRelative ? currentX + args[i] : args[i]
                    const y = isRelative ? currentY + args[i + 1] : args[i + 1]
                    absArgs.push(x, y)
                    currentX = x
                    currentY = y
                }
                break

            case 'H': // Horizontal line
                for (let i = 0; i < args.length; i++) {
                    const x = isRelative ? currentX + args[i] : args[i]
                    absArgs.push(x, currentY)
                    currentX = x
                }
                result.push({ command: 'L', args: absArgs })
                continue

            case 'V': // Vertical line
                for (let i = 0; i < args.length; i++) {
                    const y = isRelative ? currentY + args[i] : args[i]
                    absArgs.push(currentX, y)
                    currentY = y
                }
                result.push({ command: 'L', args: absArgs })
                continue

            case 'C': // Cubic bezier
                for (let i = 0; i < args.length; i += 6) {
                    const x1 = isRelative ? currentX + args[i] : args[i]
                    const y1 = isRelative ? currentY + args[i + 1] : args[i + 1]
                    const x2 = isRelative ? currentX + args[i + 2] : args[i + 2]
                    const y2 = isRelative ? currentY + args[i + 3] : args[i + 3]
                    const x = isRelative ? currentX + args[i + 4] : args[i + 4]
                    const y = isRelative ? currentY + args[i + 5] : args[i + 5]
                    absArgs.push(x1, y1, x2, y2, x, y)
                    lastControlX = x2
                    lastControlY = y2
                    currentX = x
                    currentY = y
                }
                break

            case 'S': // Smooth cubic bezier
                for (let i = 0; i < args.length; i += 4) {
                    // Reflect last control point
                    let x1: number, y1: number
                    if (lastCommand === 'C' || lastCommand === 'S') {
                        x1 = 2 * currentX - lastControlX
                        y1 = 2 * currentY - lastControlY
                    } else {
                        x1 = currentX
                        y1 = currentY
                    }
                    const x2 = isRelative ? currentX + args[i] : args[i]
                    const y2 = isRelative ? currentY + args[i + 1] : args[i + 1]
                    const x = isRelative ? currentX + args[i + 2] : args[i + 2]
                    const y = isRelative ? currentY + args[i + 3] : args[i + 3]
                    absArgs.push(x1, y1, x2, y2, x, y)
                    lastControlX = x2
                    lastControlY = y2
                    currentX = x
                    currentY = y
                }
                result.push({ command: 'C', args: absArgs })
                lastCommand = 'S'
                continue

            case 'Q': // Quadratic bezier
                for (let i = 0; i < args.length; i += 4) {
                    const x1 = isRelative ? currentX + args[i] : args[i]
                    const y1 = isRelative ? currentY + args[i + 1] : args[i + 1]
                    const x = isRelative ? currentX + args[i + 2] : args[i + 2]
                    const y = isRelative ? currentY + args[i + 3] : args[i + 3]
                    absArgs.push(x1, y1, x, y)
                    lastControlX = x1
                    lastControlY = y1
                    currentX = x
                    currentY = y
                }
                break

            case 'T': // Smooth quadratic bezier
                for (let i = 0; i < args.length; i += 2) {
                    let x1: number, y1: number
                    if (lastCommand === 'Q' || lastCommand === 'T') {
                        x1 = 2 * currentX - lastControlX
                        y1 = 2 * currentY - lastControlY
                    } else {
                        x1 = currentX
                        y1 = currentY
                    }
                    const x = isRelative ? currentX + args[i] : args[i]
                    const y = isRelative ? currentY + args[i + 1] : args[i + 1]
                    absArgs.push(x1, y1, x, y)
                    lastControlX = x1
                    lastControlY = y1
                    currentX = x
                    currentY = y
                }
                result.push({ command: 'Q', args: absArgs })
                lastCommand = 'T'
                continue

            case 'A': // Arc
                for (let i = 0; i < args.length; i += 7) {
                    const rx = args[i]
                    const ry = args[i + 1]
                    const rotation = args[i + 2]
                    const largeArc = args[i + 3]
                    const sweep = args[i + 4]
                    const x = isRelative ? currentX + args[i + 5] : args[i + 5]
                    const y = isRelative ? currentY + args[i + 6] : args[i + 6]
                    absArgs.push(rx, ry, rotation, largeArc, sweep, x, y)
                    currentX = x
                    currentY = y
                }
                break

            case 'Z': // Close path
                absArgs.push(startX, startY)
                currentX = startX
                currentY = startY
                result.push({ command: 'L', args: absArgs })
                lastCommand = 'Z'
                continue
        }

        result.push({ command: cmd, args: absArgs })
        lastCommand = cmd
    }

    return result
}

// =============================================================================
// CURVE SAMPLING
// =============================================================================

/**
 * Sample a cubic bezier curve into points
 */
function sampleCubicBezier(
    x0: number, y0: number,
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    numSamples: number = 20
): Point[] {
    const points: Point[] = []

    for (let i = 0; i <= numSamples; i++) {
        const t = i / numSamples
        const t2 = t * t
        const t3 = t2 * t
        const mt = 1 - t
        const mt2 = mt * mt
        const mt3 = mt2 * mt

        const x = mt3 * x0 + 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t3 * x3
        const y = mt3 * y0 + 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t3 * y3

        points.push({ x, y })
    }

    return points
}

/**
 * Sample a quadratic bezier curve into points
 */
function sampleQuadraticBezier(
    x0: number, y0: number,
    x1: number, y1: number,
    x2: number, y2: number,
    numSamples: number = 15
): Point[] {
    const points: Point[] = []

    for (let i = 0; i <= numSamples; i++) {
        const t = i / numSamples
        const mt = 1 - t

        const x = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2
        const y = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2

        points.push({ x, y })
    }

    return points
}

/**
 * Sample an elliptical arc into points
 * Implementation based on SVG arc parameterization
 */
function sampleArc(
    x0: number, y0: number,
    rx: number, ry: number,
    rotation: number,
    largeArc: number,
    sweep: number,
    x1: number, y1: number,
    numSamples: number = 20
): Point[] {
    // Handle degenerate cases
    if (rx === 0 || ry === 0) {
        return [{ x: x0, y: y0 }, { x: x1, y: y1 }]
    }

    // Ensure radii are positive
    rx = Math.abs(rx)
    ry = Math.abs(ry)

    const phi = (rotation * Math.PI) / 180
    const cosPhi = Math.cos(phi)
    const sinPhi = Math.sin(phi)

    // Step 1: Compute (x1', y1')
    const dx = (x0 - x1) / 2
    const dy = (y0 - y1) / 2
    const x1p = cosPhi * dx + sinPhi * dy
    const y1p = -sinPhi * dx + cosPhi * dy

    // Correct radii if necessary
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if (lambda > 1) {
        const sqrtLambda = Math.sqrt(lambda)
        rx *= sqrtLambda
        ry *= sqrtLambda
    }

    // Step 2: Compute (cx', cy')
    const rx2 = rx * rx
    const ry2 = ry * ry
    const x1p2 = x1p * x1p
    const y1p2 = y1p * y1p

    let sq = Math.max(0, (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2))
    sq = Math.sqrt(sq)
    if (largeArc === sweep) sq = -sq

    const cxp = sq * (rx * y1p) / ry
    const cyp = sq * -(ry * x1p) / rx

    // Step 3: Compute (cx, cy)
    const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x1) / 2
    const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y1) / 2

    // Step 4: Compute angles
    const ux = (x1p - cxp) / rx
    const uy = (y1p - cyp) / ry
    const vx = (-x1p - cxp) / rx
    const vy = (-y1p - cyp) / ry

    const angleStart = Math.atan2(uy, ux)
    let angleExtent = Math.atan2(vy, vx) - angleStart

    if (sweep === 0 && angleExtent > 0) {
        angleExtent -= 2 * Math.PI
    } else if (sweep === 1 && angleExtent < 0) {
        angleExtent += 2 * Math.PI
    }

    // Sample the arc
    const points: Point[] = []
    for (let i = 0; i <= numSamples; i++) {
        const t = i / numSamples
        const angle = angleStart + t * angleExtent

        const xp = rx * Math.cos(angle)
        const yp = ry * Math.sin(angle)

        const x = cosPhi * xp - sinPhi * yp + cx
        const y = sinPhi * xp + cosPhi * yp + cy

        points.push({ x, y })
    }

    return points
}

// =============================================================================
// RAMER-DOUGLAS-PEUCKER SIMPLIFICATION
// =============================================================================

/**
 * Calculate perpendicular distance from point to line segment
 */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.x - lineStart.x
    const dy = lineEnd.y - lineStart.y

    if (dx === 0 && dy === 0) {
        // Line segment is a point
        return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2)
    }

    const t = Math.max(0, Math.min(1,
        ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy)
    ))

    const projX = lineStart.x + t * dx
    const projY = lineStart.y + t * dy

    return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2)
}

/**
 * Ramer-Douglas-Peucker algorithm for path simplification
 * Reduces number of points while preserving shape
 *
 * @param points - Array of points to simplify
 * @param epsilon - Distance threshold (higher = more simplification)
 * @returns Simplified array of points
 */
export function rdpSimplify(points: Point[], epsilon: number): Point[] {
    if (points.length < 3) return points

    // Find point with maximum distance from line between first and last
    let maxDist = 0
    let maxIndex = 0

    const start = points[0]
    const end = points[points.length - 1]

    for (let i = 1; i < points.length - 1; i++) {
        const dist = perpendicularDistance(points[i], start, end)
        if (dist > maxDist) {
            maxDist = dist
            maxIndex = i
        }
    }

    // If max distance is greater than epsilon, recursively simplify
    if (maxDist > epsilon) {
        const left = rdpSimplify(points.slice(0, maxIndex + 1), epsilon)
        const right = rdpSimplify(points.slice(maxIndex), epsilon)

        // Combine results (avoid duplicating the middle point)
        return [...left.slice(0, -1), ...right]
    }

    // All points are within epsilon, return just endpoints
    return [start, end]
}

// =============================================================================
// POINT RESAMPLING
// =============================================================================

/**
 * Calculate total path length
 */
function calculatePathLength(points: Point[]): number {
    let length = 0
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x
        const dy = points[i].y - points[i - 1].y
        length += Math.sqrt(dx * dx + dy * dy)
    }
    return length
}

/**
 * Resample path to have evenly spaced points
 *
 * @param points - Original points
 * @param numPoints - Target number of points
 * @returns Array of evenly spaced points
 */
export function resamplePath(points: Point[], numPoints: number): Point[] {
    if (points.length < 2) return points
    if (numPoints < 2) return [points[0]]

    const totalLength = calculatePathLength(points)
    if (totalLength === 0) return [points[0]]

    const segmentLength = totalLength / (numPoints - 1)
    const result: Point[] = [{ ...points[0] }]

    let currentLength = 0
    let targetLength = segmentLength
    let pointIndex = 0

    while (result.length < numPoints && pointIndex < points.length - 1) {
        const dx = points[pointIndex + 1].x - points[pointIndex].x
        const dy = points[pointIndex + 1].y - points[pointIndex].y
        const segLen = Math.sqrt(dx * dx + dy * dy)

        if (currentLength + segLen >= targetLength) {
            // Interpolate point on this segment
            const t = (targetLength - currentLength) / segLen
            result.push({
                x: points[pointIndex].x + t * dx,
                y: points[pointIndex].y + t * dy
            })
            targetLength += segmentLength
        } else {
            currentLength += segLen
            pointIndex++
        }
    }

    // Ensure we end at the last point
    if (result.length < numPoints) {
        result.push({ ...points[points.length - 1] })
    }

    return result
}

// =============================================================================
// MAIN SVG TO POINTS CONVERTER
// =============================================================================

export interface SvgToPointsOptions {
    /** Number of points to output (default: 80) */
    numPoints?: number
    /** RDP simplification epsilon - higher = more simplification (default: auto-calculated) */
    epsilon?: number
    /** Number of samples per curve segment (default: 20) */
    curveSamples?: number
    /** Whether to close the path if not already closed (default: true) */
    closePath?: boolean
}

/**
 * Extract path data from SVG string
 */
function extractPathData(svgString: string): string[] {
    const paths: string[] = []

    // Match <path> elements and extract d attribute
    const pathRegex = /<path[^>]*\sd=["']([^"']+)["'][^>]*\/?>/gi
    let match: RegExpExecArray | null
    while ((match = pathRegex.exec(svgString)) !== null) {
        paths.push(match[1])
    }

    // Also try to match polyline and polygon elements
    const polylineRegex = /<(?:polyline|polygon)[^>]*\spoints=["']([^"']+)["'][^>]*\/?>/gi
    while ((match = polylineRegex.exec(svgString)) !== null) {
        // Convert points to path data
        const points = match[1].trim().split(/[\s,]+/)
        if (points.length >= 2) {
            let d = `M ${points[0]} ${points[1]}`
            for (let i = 2; i < points.length; i += 2) {
                if (i + 1 < points.length) {
                    d += ` L ${points[i]} ${points[i + 1]}`
                }
            }
            paths.push(d)
        }
    }

    return paths
}

/**
 * Convert parsed commands to points array
 */
function commandsToPoints(commands: ParsedCommand[], curveSamples: number): Point[] {
    const points: Point[] = []
    let currentX = 0
    let currentY = 0

    for (const { command, args } of commands) {
        switch (command) {
            case 'M':
                for (let i = 0; i < args.length; i += 2) {
                    currentX = args[i]
                    currentY = args[i + 1]
                    points.push({ x: currentX, y: currentY })
                }
                break

            case 'L':
                for (let i = 0; i < args.length; i += 2) {
                    currentX = args[i]
                    currentY = args[i + 1]
                    points.push({ x: currentX, y: currentY })
                }
                break

            case 'C':
                for (let i = 0; i < args.length; i += 6) {
                    const curvePoints = sampleCubicBezier(
                        currentX, currentY,
                        args[i], args[i + 1],
                        args[i + 2], args[i + 3],
                        args[i + 4], args[i + 5],
                        curveSamples
                    )
                    // Skip first point (it's the current position)
                    points.push(...curvePoints.slice(1))
                    currentX = args[i + 4]
                    currentY = args[i + 5]
                }
                break

            case 'Q':
                for (let i = 0; i < args.length; i += 4) {
                    const curvePoints = sampleQuadraticBezier(
                        currentX, currentY,
                        args[i], args[i + 1],
                        args[i + 2], args[i + 3],
                        curveSamples
                    )
                    points.push(...curvePoints.slice(1))
                    currentX = args[i + 2]
                    currentY = args[i + 3]
                }
                break

            case 'A':
                for (let i = 0; i < args.length; i += 7) {
                    const arcPoints = sampleArc(
                        currentX, currentY,
                        args[i], args[i + 1],     // rx, ry
                        args[i + 2],               // rotation
                        args[i + 3],               // largeArc
                        args[i + 4],               // sweep
                        args[i + 5], args[i + 6], // x, y
                        curveSamples
                    )
                    points.push(...arcPoints.slice(1))
                    currentX = args[i + 5]
                    currentY = args[i + 6]
                }
                break
        }
    }

    return points
}

/**
 * Convert SVG string to array of points
 *
 * @param svgString - SVG content as string
 * @param options - Conversion options
 * @returns Array of {x, y} points
 */
export function svgToPoints(svgString: string, options: SvgToPointsOptions = {}): Point[] {
    const {
        numPoints = 80,
        curveSamples = 20,
        closePath = true
    } = options

    // Extract all path data from SVG
    const pathDataList = extractPathData(svgString)

    if (pathDataList.length === 0) {
        console.warn('[SVG Parser] No path data found in SVG')
        return []
    }

    // Process all paths and combine points
    let allPoints: Point[] = []

    for (const pathData of pathDataList) {
        // Tokenize and convert to absolute commands
        const tokens = tokenizePath(pathData)
        const absoluteCommands = toAbsoluteCommands(tokens)

        // Convert commands to points with curve sampling
        const pathPoints = commandsToPoints(absoluteCommands, curveSamples)
        allPoints.push(...pathPoints)
    }

    if (allPoints.length === 0) {
        console.warn('[SVG Parser] No points extracted from SVG paths')
        return []
    }

    // Close path if needed
    if (closePath && allPoints.length > 2) {
        const first = allPoints[0]
        const last = allPoints[allPoints.length - 1]
        const dist = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2)

        // Calculate average segment length for comparison
        const avgSegment = calculatePathLength(allPoints) / allPoints.length

        if (dist > avgSegment * 0.1) {
            allPoints.push({ ...first })
        }
    }

    // Calculate auto epsilon based on bounding box
    let epsilon = options.epsilon
    if (epsilon === undefined) {
        const xs = allPoints.map(p => p.x)
        const ys = allPoints.map(p => p.y)
        const width = Math.max(...xs) - Math.min(...xs)
        const height = Math.max(...ys) - Math.min(...ys)
        const diagonal = Math.sqrt(width * width + height * height)
        // Default epsilon is 0.5% of diagonal
        epsilon = diagonal * 0.005
    }

    // Simplify using RDP
    const simplified = rdpSimplify(allPoints, epsilon)

    // Resample to target number of points
    const resampled = resamplePath(simplified, numPoints)

    console.log(`[SVG Parser] Converted: ${allPoints.length} raw points → ${simplified.length} simplified → ${resampled.length} resampled`)

    return resampled
}

/**
 * Normalize points to unit square centered at origin
 * Useful for shape comparison and fitting
 */
export function normalizePoints(points: Point[]): Point[] {
    if (points.length === 0) return []

    // Find bounding box
    const xs = points.map(p => p.x)
    const ys = points.map(p => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    const width = maxX - minX
    const height = maxY - minY
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const scale = Math.max(width, height)

    if (scale === 0) return points.map(() => ({ x: 0, y: 0 }))

    return points.map(p => ({
        x: (p.x - centerX) / scale,
        y: (p.y - centerY) / scale
    }))
}

/**
 * Get SVG viewBox dimensions
 */
export function getViewBox(svgString: string): { x: number, y: number, width: number, height: number } | null {
    const match = svgString.match(/viewBox=["']([^"']+)["']/)
    if (!match) return null

    const parts = match[1].trim().split(/[\s,]+/).map(parseFloat)
    if (parts.length !== 4) return null

    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
}
