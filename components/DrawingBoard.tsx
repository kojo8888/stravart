'use client'

import React, { useRef, useState } from 'react'

const DrawingBoard = ({
    onSvgGenerated,
}: {
    onSvgGenerated: (svg: string) => void
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const [drawing, setDrawing] = useState(false)
    const [points, setPoints] = useState<{ x: number; y: number }[]>([])

    const handleMouseDown = () => setDrawing(true)
    const handleMouseUp = () => {
        setDrawing(false)
        generateSVG()
    }
    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!drawing || !canvasRef.current) return
        const rect = canvasRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        setPoints((prev) => [...prev, { x, y }])

        const ctx = canvasRef.current.getContext('2d')
        if (ctx) {
            ctx.fillStyle = 'black'
            ctx.fillRect(x, y, 2, 2)
        }
    }

    const generateSVG = () => {
        if (points.length < 2) return

        const path = points
            .map(
                (point, index) =>
                    `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
            )
            .join(' ')

        const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
        <path d="${path}" fill="none" stroke="black" stroke-width="2" />
      </svg>
    `
        onSvgGenerated(svg)
    }

    return (
        <div>
            <canvas
                ref={canvasRef}
                width={500}
                height={500}
                className="border"
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
            />
            <button onClick={() => setPoints([])}>Clear</button>
        </div>
    )
}

export default DrawingBoard
