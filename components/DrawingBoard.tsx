'use client'

import React, { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

const DrawingBoard = ({
    onSvgGenerated,
}: {
    onSvgGenerated: (svg: string) => void
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const [drawing, setDrawing] = useState(false)
    const [points, setPoints] = useState<{ x: number; y: number }[]>([])
    const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null)
    
    // Minimum distance between points to ensure even distribution
    const MIN_DISTANCE = 3

    const calculateDistance = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
    }

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return
        setDrawing(true)
        
        const rect = canvasRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        
        // Always add the first point
        const firstPoint = { x, y }
        setPoints([firstPoint])
        setLastPoint(firstPoint)
        
        // Draw the first point
        const ctx = canvasRef.current.getContext('2d')
        if (ctx) {
            ctx.fillStyle = 'black'
            ctx.fillRect(x - 1, y - 1, 3, 3)
        }
    }

    const handleMouseUp = () => {
        setDrawing(false)
        setLastPoint(null)
        generateSVG()
    }

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!drawing || !canvasRef.current || !lastPoint) return
        
        const rect = canvasRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const currentPoint = { x, y }
        
        // Only add point if it's far enough from the last point
        const distance = calculateDistance(lastPoint, currentPoint)
        if (distance >= MIN_DISTANCE) {
            setPoints((prev) => [...prev, currentPoint])
            setLastPoint(currentPoint)
            
            // Draw line from last point to current point
            const ctx = canvasRef.current.getContext('2d')
            if (ctx) {
                ctx.strokeStyle = 'black'
                ctx.lineWidth = 2
                ctx.lineCap = 'round'
                ctx.beginPath()
                ctx.moveTo(lastPoint.x, lastPoint.y)
                ctx.lineTo(currentPoint.x, currentPoint.y)
                ctx.stroke()
            }
        }
    }

    const clearCanvas = () => {
        setPoints([])
        setLastPoint(null)
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d')
            if (ctx) {
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
            }
        }
        // Clear the SVG by sending empty string
        onSvgGenerated('')
    }

    // Interpolate additional points between existing points for smoother curves
    const interpolatePoints = (points: { x: number; y: number }[]) => {
        if (points.length < 2) return points
        
        const interpolated: { x: number; y: number }[] = []
        
        for (let i = 0; i < points.length - 1; i++) {
            const current = points[i]
            const next = points[i + 1]
            
            interpolated.push(current)
            
            // Add interpolated point if distance is large enough
            const distance = calculateDistance(current, next)
            if (distance > MIN_DISTANCE * 2) {
                const midPoint = {
                    x: (current.x + next.x) / 2,
                    y: (current.y + next.y) / 2
                }
                interpolated.push(midPoint)
            }
        }
        
        // Add the last point
        interpolated.push(points[points.length - 1])
        return interpolated
    }

    const generateSVG = () => {
        if (points.length < 2) return

        // Interpolate points for smoother curves
        const smoothedPoints = interpolatePoints(points)

        const path = smoothedPoints
            .map(
                (point, index) =>
                    `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
            )
            .join(' ')

        const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300">
        <path d="${path}" fill="none" stroke="black" stroke-width="2" />
      </svg>
    `
        onSvgGenerated(svg)
    }

    return (
        <div className="space-y-3">
            <canvas
                ref={canvasRef}
                width={500}
                height={300}
                className="border border-gray-300 rounded cursor-crosshair w-full"
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                style={{ maxWidth: '100%', height: 'auto' }}
            />
            <div className="flex gap-2 justify-between items-center">
                <Button onClick={clearCanvas} variant="outline" size="sm">
                    🗑️ Clear
                </Button>
                <div className="flex gap-4 text-sm text-gray-500">
                    <span>📍 {points.length} points</span>
                    <span>Draw by clicking and dragging</span>
                </div>
            </div>
        </div>
    )
}

export default DrawingBoard
