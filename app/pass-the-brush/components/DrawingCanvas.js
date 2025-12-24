'use client';

import { useEffect, useRef, useState } from 'react';
import { ReactSketchCanvas } from 'react-sketch-canvas';
import { supabase } from '../../../lib/supabase';

export default function DrawingCanvas({ roomId, isMyTurn, onCanvasUpdate }) {
  const canvasRef = useRef(null);
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [eraserMode, setEraserMode] = useState(false);
  const saveTimeoutRef = useRef(null);

  // Load canvas data from database
  useEffect(() => {
    loadCanvasData();
  }, [roomId]);

  const loadCanvasData = async () => {
    try {
      const { data, error } = await supabase
        .from('pass_the_brush_rooms')
        .select('canvas_data')
        .eq('id', roomId)
        .single();

      if (error) throw error;

      if (data?.canvas_data && canvasRef.current) {
        await canvasRef.current.loadPaths(data.canvas_data);
      }
    } catch (err) {
      console.error('Error loading canvas:', err);
    }
  };

  // Save canvas data to database (debounced)
  const saveCanvasData = async () => {
    try {
      if (!canvasRef.current) return;

      const paths = await canvasRef.current.exportPaths();
      
      const { error } = await supabase
        .from('pass_the_brush_rooms')
        .update({
          canvas_data: paths,
          updated_at: new Date().toISOString()
        })
        .eq('id', roomId);

      if (error) throw error;

      if (onCanvasUpdate) {
        onCanvasUpdate(paths);
      }
    } catch (err) {
      console.error('Error saving canvas:', err);
    }
  };

  const debouncedSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(saveCanvasData, 1000);
  };

  // Setup realtime canvas sync
  useEffect(() => {
    const channel = supabase
      .channel(`canvas:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pass_the_brush_rooms',
          filter: `id=eq.${roomId}`
        },
        async (payload) => {
          if (payload.new?.canvas_data && canvasRef.current) {
            await canvasRef.current.loadPaths(payload.new.canvas_data);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [roomId]);

  const handleUndo = () => {
    if (canvasRef.current && isMyTurn) {
      canvasRef.current.undo();
      debouncedSave();
    }
  };

  const handleRedo = () => {
    if (canvasRef.current && isMyTurn) {
      canvasRef.current.redo();
      debouncedSave();
    }
  };

  const handleClear = () => {
    if (canvasRef.current && isMyTurn) {
      canvasRef.current.clearCanvas();
      debouncedSave();
    }
  };

  const toggleEraser = () => {
    setEraserMode(!eraserMode);
  };

  const colors = [
    '#000000', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500',
    '#800080', '#FFC0CB', '#A52A2A', '#808080'
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {isMyTurn && (
        <div className="bg-gray-100 p-4 rounded-lg space-y-4">
          {/* Tools */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-700">Tools:</span>
            <button
              onClick={toggleEraser}
              className={`px-4 py-2 rounded ${
                eraserMode
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-200'
              }`}
            >
              {eraserMode ? '🧹 Eraser' : '✏️ Pencil'}
            </button>
            <button
              onClick={handleUndo}
              className="px-4 py-2 rounded bg-white text-gray-700 hover:bg-gray-200"
            >
              ↩️ Undo
            </button>
            <button
              onClick={handleRedo}
              className="px-4 py-2 rounded bg-white text-gray-700 hover:bg-gray-200"
            >
              ↪️ Redo
            </button>
            <button
              onClick={handleClear}
              className="px-4 py-2 rounded bg-red-500 text-white hover:bg-red-600"
            >
              🗑️ Clear
            </button>
          </div>

          {/* Colors */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-700">Color:</span>
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => {
                  setSelectedColor(color);
                  setEraserMode(false);
                }}
                className={`w-8 h-8 rounded-full border-2 ${
                  selectedColor === color && !eraserMode
                    ? 'border-blue-600 scale-110'
                    : 'border-gray-300'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>

          {/* Brush Size */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-gray-700">Size:</span>
            <input
              type="range"
              min="1"
              max="20"
              value={brushSize}
              onChange={(e) => setBrushSize(parseInt(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm text-gray-700 w-12">{brushSize}px</span>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="relative border-4 border-gray-300 rounded-lg overflow-hidden bg-white">
        {!isMyTurn && (
          <div className="absolute inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-10">
            <p className="text-white text-xl font-bold">Wait for your turn...</p>
          </div>
        )}
        <ReactSketchCanvas
          ref={canvasRef}
          width="100%"
          height="600px"
          strokeWidth={brushSize}
          strokeColor={eraserMode ? '#ffffff' : selectedColor}
          canvasColor="#ffffff"
          style={{
            border: 'none',
          }}
          onChange={debouncedSave}
          allowOnlyPointerType="all"
          withViewBox={false}
        />
      </div>
    </div>
  );
}