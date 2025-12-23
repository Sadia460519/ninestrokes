
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { supabase } from '../../../lib/supabase';

export default function DrawingCanvas({ roomId, isMyTurn, onCanvasUpdate }) {
  const canvasRef = useRef(null);
  const fabricCanvasRef = useRef(null);
 
  const channelRef = useRef(null);
  const isDrawingRef = useRef(false);
  const saveTimeoutRef = useRef(null);

  // State
  const [selectedTool, setSelectedTool] = useState('pencil');
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [isLoading, setIsLoading] = useState(true);

  // Debug logging
  const debugLog = useCallback((context, data) => {
    console.log(`[DrawingCanvas Debug - ${context}]:`, {
      timestamp: new Date().toISOString(),
      roomId,
      isMyTurn,
      ...data
    });
  }, [roomId, isMyTurn]);

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    debugLog('Initialize', { action: 'creating fabric canvas' });

    try {
      // Create fabric canvas
      const canvas = new fabric.Canvas(canvasRef.current, {
        width: 800,
        height: 600,
        backgroundColor: '#ffffff',
        isDrawingMode: true,
      });

      // Configure drawing brush
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = selectedColor;
      canvas.freeDrawingBrush.width = brushSize;

      fabricCanvasRef.current = canvas;

      debugLog('Initialize', { 
        action: 'canvas created',
        width: 800,
        height: 600
      });

      // Load existing canvas data
      loadCanvasData();

      // Setup canvas event listeners
      canvas.on('mouse:down', () => {
        isDrawingRef.current = true;
        debugLog('Canvas Event', { event: 'mouse:down' });
      });

      canvas.on('mouse:up', () => {
        isDrawingRef.current = false;
        debugLog('Canvas Event', { event: 'mouse:up' });
        debouncedSave();
      });

      canvas.on('object:added', () => {
        debugLog('Canvas Event', { event: 'object:added' });
        if (!isDrawingRef.current) {
          debouncedSave();
        }
      });

      canvas.on('object:modified', () => {
        debugLog('Canvas Event', { event: 'object:modified' });
        debouncedSave();
      });

      setIsLoading(false);

      // Cleanup
      return () => {
        debugLog('Initialize', { action: 'cleaning up canvas' });
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
        }
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        canvas.dispose();
      };
    } catch (err) {
      debugLog('Initialize', { error: err.message });
      console.error('Error initializing canvas:', err);
      setIsLoading(false);
    }
  }, []);

  // Load canvas data from database
  const loadCanvasData = async () => {
    try {
      debugLog('LoadCanvas', { action: 'fetching from database' });

      const { data, error } = await supabase
        .from('pass_the_brush_rooms')
        .select('canvas_data')
        .eq('id', roomId)
        .single();

      if (error) {
        debugLog('LoadCanvas', { error: 'fetch failed', details: error });
        throw error;
      }

      if (data?.canvas_data) {
        debugLog('LoadCanvas', { action: 'found existing data', hasData: true });
        
        const canvas = fabricCanvasRef.current;
        if (canvas) {
          try {
            await new Promise((resolve, reject) => {
              canvas.loadFromJSON(data.canvas_data, () => {
                canvas.renderAll();
                debugLog('LoadCanvas', { 
                  action: 'loaded successfully',
                  objectCount: canvas.getObjects().length
                });
                resolve();
              }, (error) => {
                debugLog('LoadCanvas', { error: 'JSON parse failed', details: error });
                reject(error);
              });
            });
          } catch (jsonError) {
            debugLog('LoadCanvas', { error: 'failed to parse canvas JSON', details: jsonError });
          }
        }
      } else {
        debugLog('LoadCanvas', { action: 'no existing data found' });
      }
    } catch (err) {
      debugLog('LoadCanvas', { error: err.message });
      console.error('Error loading canvas:', err);
    }
  };

  // Save canvas data to database
  const saveCanvasData = async () => {
    try {
      const canvas = fabricCanvasRef.current;
      if (!canvas) {
        debugLog('SaveCanvas', { error: 'no canvas instance' });
        return;
      }

      const canvasJSON = canvas.toJSON();
      debugLog('SaveCanvas', { 
        action: 'saving to database',
        objectCount: canvas.getObjects().length,
        jsonSize: JSON.stringify(canvasJSON).length
      });

      const { error } = await supabase
        .from('pass_the_brush_rooms')
        .update({
          canvas_data: canvasJSON,
          updated_at: new Date().toISOString()
        })
        .eq('id', roomId);

      if (error) {
        debugLog('SaveCanvas', { error: 'update failed', details: error });
        throw error;
      }

      debugLog('SaveCanvas', { action: 'saved successfully' });

      // Notify parent component
      if (onCanvasUpdate) {
        onCanvasUpdate(canvasJSON);
      }

    } catch (err) {
      debugLog('SaveCanvas', { error: err.message });
      console.error('Error saving canvas:', err);
    }
  };

  // Debounced save function
  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      debugLog('DebouncedSave', { action: 'executing save' });
      saveCanvasData();
    }, 1000);
  }, [roomId, debugLog]);

  // Setup realtime canvas sync
  useEffect(() => {
    if (!roomId) return;

    debugLog('Realtime', { action: 'setting up canvas sync' });

    channelRef.current = supabase
      .channel(`canvas:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pass_the_brush_rooms',
          filter: `id=eq.${roomId}`
        },
        (payload) => {
          debugLog('Realtime', { 
            action: 'canvas update received',
            hasCanvasData: !!payload.new?.canvas_data
          });

          if (payload.new?.canvas_data && !isDrawingRef.current) {
            const canvas = fabricCanvasRef.current;
            if (canvas) {
              canvas.loadFromJSON(payload.new.canvas_data, () => {
                canvas.renderAll();
                debugLog('Realtime', { action: 'canvas reloaded from realtime update' });
              });
            }
          }
        }
      )
      .subscribe((status) => {
        debugLog('Realtime', { status });
      });

    return () => {
      if (channelRef.current) {
        debugLog('Realtime', { action: 'cleaning up subscription' });
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [roomId, debugLog]);

  // Update canvas when turn changes
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    debugLog('TurnChange', { isMyTurn, selectedTool });

    if (isMyTurn) {
      // Enable drawing
      canvas.isDrawingMode = selectedTool !== 'select';
      canvas.selection = selectedTool === 'select';
      canvas.forEachObject((obj) => {
        obj.selectable = selectedTool === 'select';
      });
      debugLog('TurnChange', { action: 'drawing enabled' });
    } else {
      // Disable drawing
      canvas.isDrawingMode = false;
      canvas.selection = false;
      canvas.forEachObject((obj) => {
        obj.selectable = false;
      });
      debugLog('TurnChange', { action: 'drawing disabled' });
    }

    canvas.renderAll();
  }, [isMyTurn, selectedTool, debugLog]);

  // Tool change handler
  const handleToolChange = (tool) => {
    debugLog('ToolChange', { from: selectedTool, to: tool });
    setSelectedTool(tool);

    const canvas = fabricCanvasRef.current;
    if (!canvas || !isMyTurn) return;

    if (tool === 'pencil') {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = selectedColor;
      canvas.freeDrawingBrush.width = brushSize;
    } else if (tool === 'eraser') {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = '#ffffff';
      canvas.freeDrawingBrush.width = brushSize * 2;
    } else if (tool === 'select') {
      canvas.isDrawingMode = false;
      canvas.selection = true;
      canvas.forEachObject((obj) => {
        obj.selectable = true;
      });
    }

    canvas.renderAll();
  };

  // Color change handler
  const handleColorChange = (color) => {
    debugLog('ColorChange', { from: selectedColor, to: color });
    setSelectedColor(color);

    const canvas = fabricCanvasRef.current;
    if (!canvas || !isMyTurn) return;

    if (selectedTool === 'pencil' && canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = color;
    }
  };

  // Brush size change handler
  const handleBrushSizeChange = (size) => {
    debugLog('BrushSizeChange', { from: brushSize, to: size });
    setBrushSize(size);

    const canvas = fabricCanvasRef.current;
    if (!canvas || !isMyTurn) return;

    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.width = selectedTool === 'eraser' ? size * 2 : size;
    }
  };

  // Clear canvas handler
  const handleClearCanvas = () => {
    debugLog('ClearCanvas', { action: 'clearing all objects' });
    
    const canvas = fabricCanvasRef.current;
    if (!canvas || !isMyTurn) return;

    canvas.clear();
    canvas.backgroundColor = '#ffffff';
    canvas.renderAll();
    saveCanvasData();
  };

  // Undo handler
  const handleUndo = () => {
    debugLog('Undo', { action: 'removing last object' });
    
    const canvas = fabricCanvasRef.current;
    if (!canvas || !isMyTurn) return;

    const objects = canvas.getObjects();
    if (objects.length > 0) {
      canvas.remove(objects[objects.length - 1]);
      canvas.renderAll();
      saveCanvasData();
    }
  };

  const colors = [
    '#000000', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500',
    '#800080', '#FFC0CB', '#A52A2A', '#808080'
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading canvas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {isMyTurn && (
        <div className="bg-gray-100 p-4 rounded-lg space-y-4">
          {/* Tools */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">Tools:</span>
            <button
              onClick={() => handleToolChange('pencil')}
              className={`px-4 py-2 rounded ${
                selectedTool === 'pencil'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-200'
              }`}
            >
              ✏️ Pencil
            </button>
            <button
              onClick={() => handleToolChange('eraser')}
              className={`px-4 py-2 rounded ${
                selectedTool === 'eraser'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-200'
              }`}
            >
              🧹 Eraser
            </button>
            <button
              onClick={() => handleToolChange('select')}
              className={`px-4 py-2 rounded ${
                selectedTool === 'select'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-200'
              }`}
            >
              👆 Select
            </button>
            <button
              onClick={handleUndo}
              className="px-4 py-2 rounded bg-white text-gray-700 hover:bg-gray-200"
            >
              ↩️ Undo
            </button>
            <button
              onClick={handleClearCanvas}
              className="px-4 py-2 rounded bg-red-500 text-white hover:bg-red-600"
            >
              🗑️ Clear
            </button>
          </div>

          {/* Colors */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">Color:</span>
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => handleColorChange(color)}
                className={`w-8 h-8 rounded-full border-2 ${
                  selectedColor === color
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
              max="50"
              value={brushSize}
              onChange={(e) => handleBrushSizeChange(parseInt(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm text-gray-700 w-12">{brushSize}px</span>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="relative border-4 border-gray-300 rounded-lg overflow-hidden">
        {!isMyTurn && (
          <div className="absolute inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-10">
            <p className="text-white text-xl font-bold">Wait for your turn...</p>
          </div>
        )}
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}