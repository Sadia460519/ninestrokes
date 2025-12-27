'use client';

import DrawingCanvas from '../../components/DrawingCanvas';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';

export default function GameRoom() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode;

  // State management
  const [user, setUser] = useState(null);
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [gameState, setGameState] = useState('waiting');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [topicOptions, setTopicOptions] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(1);
  const [maxTurns, setMaxTurns] = useState(3);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [canvasData, setCanvasData] = useState(null);

  // Refs for realtime subscriptions and stable references
  const roomChannelRef = useRef(null);
  const messagesChannelRef = useRef(null);
  const timerRef = useRef(null);
  const roomIdRef = useRef(null); // Stable reference to room.id
  const isRotatingRef = useRef(false); // Prevent double rotation

  // Keep roomIdRef in sync
  useEffect(() => {
    if (room?.id) {
      roomIdRef.current = room.id;
    }
  }, [room?.id]);

  // Debug logging helper
  const debugLog = useCallback((context, data) => {
    console.log(`[PassTheBrush Debug - ${context}]:`, {
      timestamp: new Date().toISOString(),
      roomCode,
      visibleUserId: user?.id?.substring(0, 8),
      ...data
    });
  }, [roomCode, user?.id]);

  // Pass turn handler - FIXED VERSION WITH FRESH DATA AND ROTATION LOCK
  const handlePassTurn = useCallback(async () => {
    // Prevent multiple simultaneous rotation attempts
    if (isRotatingRef.current) {
      debugLog('PassTurn', { action: 'already rotating, skipping' });
      return;
    }

    const currentRoomId = roomIdRef.current;
    if (!currentRoomId) {
      debugLog('PassTurn', { error: 'No room ID available' });
      return;
    }

    try {
      isRotatingRef.current = true;
      
      debugLog('PassTurn', { 
        action: 'starting',
        visibleUserId: user?.id?.substring(0, 8),
        roomId: currentRoomId
      });

      // FETCH FRESH PLAYER DATA FROM DATABASE
      const { data: freshPlayers, error: fetchError } = await supabase
        .from('pass_the_brush_players')
        .select('*')
        .eq('room_id', currentRoomId)
        .order('turn_order', { ascending: true });

      if (fetchError) {
        debugLog('PassTurn', { error: 'Failed to fetch players', details: fetchError });
        return;
      }

      if (!freshPlayers || freshPlayers.length === 0) {
        debugLog('PassTurn', { error: 'No players found' });
        return;
      }

      debugLog('PassTurn', { 
        freshPlayersCount: freshPlayers.length,
        playersWithTurn: freshPlayers.filter(p => p.is_current_turn).map(p => p.username)
      });

      const actualCurrentPlayer = freshPlayers.find(p => p.is_current_turn);
      
      if (!actualCurrentPlayer) {
        debugLog('PassTurn', { 
          error: 'No current player found in database', 
          players: freshPlayers.map(p => ({ username: p.username, isTurn: p.is_current_turn })) 
        });
        return;
      }

      // CRITICAL: Only the current player should rotate turns
      if (actualCurrentPlayer.user_id !== user?.id) {
        debugLog('PassTurn', { 
          action: 'not my turn according to fresh data, skipping',
          currentPlayerUsername: actualCurrentPlayer.username,
          myUserId: user?.id?.substring(0, 8)
        });
        return;
      }

      // Fetch fresh room data for current_turn
      const { data: freshRoom, error: roomFetchError } = await supabase
        .from('pass_the_brush_rooms')
        .select('*')
        .eq('id', currentRoomId)
        .single();

      if (roomFetchError || !freshRoom) {
        debugLog('PassTurn', { error: 'Failed to fetch room', details: roomFetchError });
        return;
      }

      const freshCurrentTurn = freshRoom.current_turn || 1;
      const freshMaxTurns = freshRoom.max_turns || 3;

      const currentIndex = freshPlayers.findIndex(p => p.is_current_turn);
      const nextIndex = (currentIndex + 1) % freshPlayers.length;
      const nextPlayer = freshPlayers[nextIndex];

      debugLog('PassTurn', { 
        currentPlayer: actualCurrentPlayer.username,
        nextPlayer: nextPlayer.username,
        currentIndex, 
        nextIndex,
        freshCurrentTurn,
        freshMaxTurns
      });

      const isRoundComplete = nextIndex === 0;
      const newTurn = isRoundComplete ? freshCurrentTurn + 1 : freshCurrentTurn;
      const isGameOver = newTurn > freshMaxTurns;

      if (isGameOver) {
        debugLog('PassTurn', { action: 'game over', finalTurn: newTurn });
        
        // First turn off current player
        await supabase
          .from('pass_the_brush_players')
          .update({ is_current_turn: false })
          .eq('id', actualCurrentPlayer.id);

        // Then update room to voting state
        await supabase
          .from('pass_the_brush_rooms')
          .update({
            game_state: 'voting',
            status: 'voting',
            turn_end_time: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentRoomId);

        debugLog('PassTurn', { action: 'game ended, moved to voting' });
        return;
      }

      // Use a transaction-like approach: update both players in sequence
      // Turn off current player first
      const { error: turnOffError } = await supabase
        .from('pass_the_brush_players')
        .update({ is_current_turn: false })
        .eq('id', actualCurrentPlayer.id);

      if (turnOffError) {
        debugLog('PassTurn', { error: 'Failed to turn off current player', details: turnOffError });
        return;
      }

      debugLog('PassTurn', { action: 'turned off current player', player: actualCurrentPlayer.username });

      // Turn on next player
      const { error: turnOnError } = await supabase
        .from('pass_the_brush_players')
        .update({ is_current_turn: true })
        .eq('id', nextPlayer.id);

      if (turnOnError) {
        debugLog('PassTurn', { error: 'Failed to turn on next player', details: turnOnError });
        // Try to recover by turning current player back on
        await supabase
          .from('pass_the_brush_players')
          .update({ is_current_turn: true })
          .eq('id', actualCurrentPlayer.id);
        return;
      }

      debugLog('PassTurn', { action: 'turned on next player', player: nextPlayer.username });

      // Update room with new turn info
      const newTurnEndTime = new Date(Date.now() + 60000).toISOString();

      const { error: roomUpdateError } = await supabase
        .from('pass_the_brush_rooms')
        .update({
          current_turn: newTurn,
          turn_end_time: newTurnEndTime,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentRoomId);

      if (roomUpdateError) {
        debugLog('PassTurn', { error: 'Failed to update room', details: roomUpdateError });
        return;
      }

      debugLog('PassTurn', { 
        action: 'completed successfully', 
        newTurn, 
        nextPlayer: nextPlayer.username,
        newTurnEndTime
      });

    } catch (err) {
      debugLog('PassTurn', { error: err.message, stack: err.stack });
      console.error('PassTurn error:', err);
    } finally {
      // Reset rotation lock after a short delay to prevent rapid re-triggers
      setTimeout(() => {
        isRotatingRef.current = false;
      }, 1000);
    }
  }, [user?.id, debugLog]);

  // Initialize user and room
  useEffect(() => {
    const initializeGame = async () => {
      try {
        debugLog('Initialize', { action: 'starting' });
        
        const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
        
        if (userError) throw userError;
        if (!currentUser) {
          debugLog('Initialize', { error: 'No authenticated user' });
          router.push('/pass-the-brush');
          return;
        }

        setUser(currentUser);
        debugLog('Initialize', { visibleUserId: currentUser.id.substring(0, 8) });

        const { data: roomData, error: roomError } = await supabase
          .from('pass_the_brush_rooms')
          .select('*')
          .eq('room_code', roomCode)
          .single();

        if (roomError) {
          debugLog('Initialize', { error: 'Room fetch failed', details: roomError });
          throw new Error('Room not found');
        }

        if (!roomData) {
          debugLog('Initialize', { error: 'Room does not exist' });
          throw new Error('Room does not exist');
        }

        setRoom(roomData);
        roomIdRef.current = roomData.id;
        setGameState(roomData.game_state || roomData.status || 'waiting');
        setCurrentTurn(roomData.current_turn || 1);
        setMaxTurns(roomData.max_turns || 3);
        
        debugLog('Initialize', { 
          roomId: roomData.id, 
          gameState: roomData.game_state || roomData.status,
          currentTurn: roomData.current_turn 
        });

        await fetchPlayers(roomData.id);
        await fetchMessages(roomData.id);

        setLoading(false);
        debugLog('Initialize', { action: 'completed' });

      } catch (err) {
        debugLog('Initialize', { error: err.message });
        setError(err.message);
        setLoading(false);
      }
    };

    initializeGame();
  }, [roomCode, router, debugLog]);

  // Fetch players
  const fetchPlayers = async (roomId) => {
    try {
      debugLog('FetchPlayers', { action: 'starting', roomId });
      
      const { data, error } = await supabase
        .from('pass_the_brush_players')
        .select('*')
        .eq('room_id', roomId)
        .order('turn_order', { ascending: true });

      if (error) throw error;

      setPlayers(data || []);
      
      const current = data?.find(p => p.is_current_turn) || data?.[0];
      setCurrentPlayer(current);
      
      debugLog('FetchPlayers', { 
        count: data?.length, 
        currentPlayerUsername: current?.username,
        players: data?.map(p => ({ username: p.username, isTurn: p.is_current_turn }))
      });

    } catch (err) {
      debugLog('FetchPlayers', { error: err.message });
      console.error('Error fetching players:', err);
    }
  };

  // Fetch messages
  const fetchMessages = async (roomId) => {
    try {
      debugLog('FetchMessages', { action: 'starting', roomId });
      
      const { data, error } = await supabase
        .from('pass_the_brush_messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(data || []);
      debugLog('FetchMessages', { count: data?.length });

    } catch (err) {
      debugLog('FetchMessages', { error: err.message });
      console.error('Error fetching messages:', err);
    }
  };

  // Setup realtime subscriptions
  useEffect(() => {
    if (!room?.id || !user?.id) return;

    debugLog('Realtime', { action: 'setting up subscriptions' });

    roomChannelRef.current = supabase
      .channel(`room:${room.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pass_the_brush_rooms',
          filter: `id=eq.${room.id}`
        },
        (payload) => {
          debugLog('Realtime Room Update', { 
            event: payload.eventType,
            newState: payload.new?.game_state || payload.new?.status,
            currentTurn: payload.new?.current_turn
          });
          
          if (payload.new) {
            setRoom(payload.new);
            setGameState(payload.new.game_state || payload.new.status || 'waiting');
            setCurrentTurn(payload.new.current_turn || 1);
            setMaxTurns(payload.new.max_turns || 3);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pass_the_brush_players',
          filter: `room_id=eq.${room.id}`
        },
        (payload) => {
          debugLog('Realtime Player Update', { 
            action: 'refetching players',
            event: payload.eventType
          });
          fetchPlayers(room.id);
        }
      )
      .subscribe((status) => {
        debugLog('Realtime Room Channel', { status });
      });

    messagesChannelRef.current = supabase
      .channel(`messages:${room.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pass_the_brush_messages',
          filter: `room_id=eq.${room.id}`
        },
        (payload) => {
          debugLog('Realtime New Message', { from: payload.new.username });
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe((status) => {
        debugLog('Realtime Messages Channel', { status });
      });

    return () => {
      debugLog('Realtime', { action: 'cleaning up subscriptions' });
      if (roomChannelRef.current) {
        supabase.removeChannel(roomChannelRef.current);
      }
      if (messagesChannelRef.current) {
        supabase.removeChannel(messagesChannelRef.current);
      }
    };
  }, [room?.id, user?.id, debugLog]);

  // Timer management - FIXED: Only current player triggers rotation
  useEffect(() => {
    // Clear any existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Only run timer during playing state
    if (!room?.turn_end_time || gameState !== 'playing') {
      setTimeRemaining(null);
      return;
    }

    // Determine if it's my turn from current players state
    const myPlayerData = players.find(p => p.user_id === user?.id);
    const isMyTurn = myPlayerData?.is_current_turn || false;

    debugLog('Timer Setup', { 
      isMyTurn, 
      myUsername: myPlayerData?.username,
      turnEndTime: room.turn_end_time
    });

    let hasTriggeredRotation = false;

    const updateTimer = () => {
      const endTime = new Date(room.turn_end_time).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      
      setTimeRemaining(remaining);

      // CRITICAL FIX: Only the current player triggers rotation when timer expires
      if (remaining === 0 && !hasTriggeredRotation && isMyTurn && !isRotatingRef.current) {
        hasTriggeredRotation = true;
        
        debugLog('Timer', { 
          action: 'time expired, I am the current player, triggering rotation',
          myUsername: myPlayerData?.username
        });
        
        // Clear interval immediately to prevent multiple triggers
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        
        // Small delay to ensure any final canvas saves complete
        setTimeout(() => {
          handlePassTurn().catch(err => {
            debugLog('Timer', { error: 'Auto-rotation failed', details: err.message });
          });
        }, 100);
      }
    };

    // Run immediately
    updateTimer();
    
    // Then run every second
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [room?.turn_end_time, gameState, players, user?.id, handlePassTurn, debugLog]);

  // Generate topic options
  const generateTopicOptions = useCallback(() => {
    const topics = [
      'A cat wearing a hat',
      'A robot dancing',
      'A flying pizza',
      'A dragon sleeping',
      'A superhero at the beach',
      'An alien cooking dinner',
      'A pirate playing guitar',
      'A wizard riding a bicycle',
      'A dinosaur gardening',
      'A ninja eating ice cream'
    ];

    const shuffled = [...topics].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);
    
    debugLog('TopicGeneration', { topics: selected });
    setTopicOptions(selected);
    return selected;
  }, [debugLog]);

  // Start game handler
  const handleStartGame = async () => {
    try {
      debugLog('StartGame', { action: 'starting', isHost: room?.host_id === user?.id });
      
      if (room?.host_id !== user?.id) {
        throw new Error('Only the host can start the game');
      }

      if (players.length < 1) {
        throw new Error('Need at least 1 player to start');
      }

      generateTopicOptions();

      await supabase
        .from('pass_the_brush_rooms')
        .update({
          game_state: 'topic_selection',
          status: 'topic_selection',
          current_turn: 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', room.id);

      debugLog('StartGame', { action: 'completed', newState: 'topic_selection' });

    } catch (err) {
      debugLog('StartGame', { error: err.message });
      console.error('StartGame error:', err);
    }
  };

  // Topic selection handler
  const handleTopicSelect = async (topic) => {
    try {
      debugLog('TopicSelect', { topic, visibleUserId: user?.id?.substring(0, 8) });
      
      if (room?.host_id !== user?.id) {
        throw new Error('Only the host can select the topic');
      }

      setSelectedTopic(topic);

      const turnEndTime = new Date(Date.now() + 60000).toISOString();

      // First, reset all players to not current turn
      await supabase
        .from('pass_the_brush_players')
        .update({ is_current_turn: false })
        .eq('room_id', room.id);

      // Then set the first player (turn_order = 1) as current
      await supabase
        .from('pass_the_brush_players')
        .update({ is_current_turn: true })
        .eq('room_id', room.id)
        .eq('turn_order', 1);

      // Finally update the room state
      await supabase
        .from('pass_the_brush_rooms')
        .update({
          game_state: 'playing',
          status: 'playing',
          current_topic: topic,
          topic: topic,
          current_turn: 1,
          turn_end_time: turnEndTime,
          updated_at: new Date().toISOString()
        })
        .eq('id', room.id);

      debugLog('TopicSelect', { 
        action: 'completed', 
        topic, 
        newState: 'playing',
        turnEndTime 
      });

    } catch (err) {
      debugLog('TopicSelect', { error: err.message });
      console.error('TopicSelect error:', err);
    }
  };

  // Send message handler
  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!newMessage.trim()) return;

    try {
      debugLog('SendMessage', { messagePreview: newMessage.substring(0, 50), roomId: room?.id });

      const player = players.find(p => p.user_id === user?.id);
      if (!player) {
        throw new Error('Player not found');
      }

      if (!room?.id) {
        throw new Error('Room ID is missing');
      }

      await supabase
        .from('pass_the_brush_messages')
        .insert({
          room_id: room.id,
          user_id: user.id,
          username: player.username || 'Anonymous',
          message: newMessage.trim()
        });

      setNewMessage('');
      debugLog('SendMessage', { action: 'completed' });

    } catch (err) {
      debugLog('SendMessage', { error: err.message });
      console.error('Error sending message:', err);
    }
  };

  // Leave room handler
  const handleLeaveRoom = async () => {
    try {
      debugLog('LeaveRoom', { action: 'starting' });

      const player = players.find(p => p.user_id === user?.id);
      if (player) {
        await supabase
          .from('pass_the_brush_players')
          .delete()
          .eq('id', player.id);
      }

      debugLog('LeaveRoom', { action: 'completed' });
      router.push('/pass-the-brush');

    } catch (err) {
      debugLog('LeaveRoom', { error: err.message });
      router.push('/pass-the-brush');
    }
  };

  // Canvas update handler
  const handleCanvasUpdate = useCallback((canvasJSON) => {
    debugLog('CanvasUpdate', { hasData: !!canvasJSON });
    setCanvasData(canvasJSON);
  }, [debugLog]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading game room...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-700 mb-6">{error}</p>
          <button
            onClick={() => router.push('/pass-the-brush')}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  const isHost = room?.host_id === user?.id;
  const currentPlayerData = players.find(p => p.user_id === user?.id);
  const isMyTurn = currentPlayerData?.is_current_turn || false;
  const activeDrawer = players.find(p => p.is_current_turn);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Pass the Brush</h1>
              <p className="text-sm text-gray-600">Room Code: <span className="font-mono font-bold">{roomCode}</span></p>
            </div>
            <div className="flex items-center gap-4">
              {gameState === 'playing' && (
                <div className="text-right">
                  <p className="text-sm text-gray-600">Turn {currentTurn} of {maxTurns}</p>
                  {timeRemaining !== null && (
                    <p className={`text-lg font-bold ${timeRemaining <= 10 ? 'text-red-600' : 'text-blue-600'}`}>
                      {timeRemaining}s
                    </p>
                  )}
                </div>
              )}
              <button
                onClick={handleLeaveRoom}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Leave Room
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Game Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Waiting State */}
            {gameState === 'waiting' && (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Waiting for Players...</h2>
                <p className="text-gray-600 mb-6">
                  {players.length} / 7 players joined
                </p>
                {isHost ? (
                  <button
                    onClick={handleStartGame}
                    disabled={players.length < 1}
                    className={`px-8 py-3 rounded-lg font-semibold text-lg ${
                      players.length < 1
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {players.length < 1 ? 'Need at least 1 player' : 'Start Game'}
                  </button>
                ) : (
                  <p className="text-gray-500">Waiting for host to start the game...</p>
                )}
              </div>
            )}

            {/* Topic Selection State */}
            {gameState === 'topic_selection' && (
              <div className="bg-white rounded-lg shadow-md p-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Choose a Drawing Topic</h2>
                {isHost ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(topicOptions.length > 0 ? topicOptions : generateTopicOptions()).map((topic, index) => (
                      <button
                        key={index}
                        onClick={() => handleTopicSelect(topic)}
                        className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                      >
                        <p className="text-lg font-semibold text-gray-900">{topic}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-600">Waiting for host to select a topic...</p>
                )}
              </div>
            )}

            {/* Playing State */}
            {gameState === 'playing' && (
              <div className="space-y-4">
                <div className="bg-white rounded-lg shadow-md p-4">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Topic: {room?.current_topic || room?.topic}</h3>
                      <p className={`text-sm ${isMyTurn ? 'text-green-600 font-semibold' : 'text-gray-600'}`}>
                        {isMyTurn ? "🎨 It's your turn to draw!" : `Watching ${activeDrawer?.username || 'player'} draw...`}
                      </p>
                    </div>
                  </div>
                  <DrawingCanvas
                    roomId={room.id}
                    isMyTurn={isMyTurn}
                    onCanvasUpdate={handleCanvasUpdate}
                  />
                </div>
              </div>
            )}

            {/* Voting State */}
            {gameState === 'voting' && (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">🎉 Game Complete!</h2>
                <p className="text-gray-600 mb-6">Great drawing everyone! Voting feature coming soon...</p>
                <button
                  onClick={handleLeaveRoom}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Return to Lobby
                </button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Players List */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Players ({players.length})</h3>
              <div className="space-y-2">
                {players.map((player) => (
                  <div
                    key={player.id}
                    className={`p-3 rounded-lg transition-all ${
                      player.is_current_turn
                        ? 'bg-blue-100 border-2 border-blue-500'
                        : 'bg-gray-50 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {player.turn_order === 1 && <span className="text-yellow-500">👑</span>}
                        <span className="font-semibold text-gray-900">
                          {player.username}
                        </span>
                        {player.user_id === user?.id && (
                          <span className="text-xs text-gray-500">(You)</span>
                        )}
                      </div>
                      {player.is_current_turn && (
                        <span className="text-xs font-semibold text-blue-600 animate-pulse">
                          🖌️ Drawing...
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat */}
            <div className="bg-white rounded-lg shadow-md p-6 flex flex-col h-96">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Chat</h3>
              <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                {messages.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center">No messages yet...</p>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className="text-sm">
                      <span className="font-semibold text-gray-900">{msg.username}:</span>{' '}
                      <span className="text-gray-700">{msg.message}</span>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}