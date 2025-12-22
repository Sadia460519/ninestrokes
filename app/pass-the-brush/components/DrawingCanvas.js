'use client'

import { useEffect, useRef, useState } from 'react'
import * as fabric from 'fabric'

export default function DrawingCanvas({ 
  isMyTurn, 
  canvasData, 
  onStrokeAdd,
  room 
}) {
  const canvasRef = useRef(null)
  const fabricCanvasRef = useRef(null)
  const [brushColor, setBrushColor] = useState('#000000')
  const [brushSize, setBrushSize] = useState(5)
  const [isEraser, setIsEraser] = useState(false)

  const colors = [
    '#000000', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500',
    '#800080', '#FFFFFF'
  ]

  useEffect(() => {
    if (!canvasRef.current) return

    // Initialize Fabric.js canvas
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 600,
      height: 800,
      backgroundColor: '#ffffff',
      isDrawingMode: isMyTurn,
      renderOnAddRemove: true
    })

    fabricCanvasRef.current = canvas

    // Set brush color and width
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = brushColor
      canvas.freeDrawingBrush.width = brushSize
    }

    // Force render
    canvas.renderAll()

    // Listen for new strokes
    canvas.on('path:created', (e) => {
      if (isMyTurn && onStrokeAdd && e.path) {
        console.log('✏️ Stroke created:', e.path)
        const strokeData = {
          type: 'path',
          path: e.path.path,
          stroke: e.path.stroke,
          strokeWidth: e.path.strokeWidth,
          fill: e.path.fill
        }
        onStrokeAdd(strokeData)
      }
      canvas.renderAll()
    })

    return () => {
      canvas.dispose()
    }
  }, [])

  // Update drawing mode when turn changes
  useEffect(() => {
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.isDrawingMode = isMyTurn
    }
  }, [isMyTurn])

  // Update brush settings
  useEffect(() => {
    if (fabricCanvasRef.current && fabricCanvasRef.current.freeDrawingBrush) {
      fabricCanvasRef.current.freeDrawingBrush.color = isEraser ? '#ffffff' : brushColor
      fabricCanvasRef.current.freeDrawingBrush.width = brushSize
    }
  }, [brushColor, brushSize, isEraser])

  function handleUndo() {
    if (!fabricCanvasRef.current) return
    const objects = fabricCanvasRef.current.getObjects()
    if (objects.length > 0) {
      fabricCanvasRef.current.remove(objects[objects.length - 1])
      fabricCanvasRef.current.renderAll()
    }
  }

  return (
    <div className="flex flex-col items-center">
      {/* Topic Display */}
      <div className="bg-pink-100 px-6 py-3 rounded-lg mb-4 w-full text-center">
        <p className="text-sm text-gray-600">Drawing Topic:</p>
        <p className="text-2xl font-bold text-pink-600">{room.topic}</p>
      </div>

      {/* Canvas */}
      <div className="border-4 border-gray-800 rounded-lg overflow-hidden shadow-2xl mb-4 bg-white">
        <canvas ref={canvasRef} />
      </div>

      {/* Drawing Tools */}
      {isMyTurn && (
        <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-[600px]">
          <div className="flex flex-col gap-4">
            
            {/* Color Picker */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Color:</p>
              <div className="flex gap-2 flex-wrap">
                {colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      setBrushColor(color)
                      setIsEraser(false)
                    }}
                    className={`w-10 h-10 rounded-full border-2 ${
                      brushColor === color && !isEraser
                        ? 'border-pink-500 scale-110'
                        : 'border-gray-300'
                    } transition`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Brush Size */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Brush Size: {brushSize}px
              </p>
              <input
                type="range"
                min="1"
                max="20"
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Tools */}
            <div className="flex gap-2">
              <button
                onClick={() => setIsEraser(!isEraser)}
                className={`flex-1 px-4 py-2 rounded-lg font-medium ${
                  isEraser
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                🧹 Eraser
              </button>
              <button
                onClick={handleUndo}
                className="flex-1 px-4 py-2 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                ↶ Undo
              </button>
            </div>
          </div>
        </div>
      )}

      {!isMyTurn && (
        <p className="text-gray-500 text-center mt-4">
          🔒 Waiting for your turn...
        </p>
      )}
    </div>
  )
}